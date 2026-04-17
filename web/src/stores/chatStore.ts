import { create } from 'zustand'
import type { Session, SessionEvent, SessionPermissionRequest, PermissionReply } from 'sandbox-agent'
import { connectToHost } from '@/services/sandboxAgent/client'
import { MessageAccumulator } from '@/services/messaging'
import { requireHost } from './hostStore'
import { useSettingsStore } from './settingsStore'
import type { Message } from '@/types'

export type ChatStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface ChatPaneState {
  hostId: number
  sessionId: string
  status: ChatStatus
  error: string | null
  messages: Message[]
  pendingPermission: SessionPermissionRequest | null
  isStreaming: boolean
}

interface ChatStoreState {
  byId: Record<string, ChatPaneState>

  openSession(hostId: number, sessionId: string): Promise<void>
  closeSession(sessionId: string): void
  sendPrompt(
    sessionId: string,
    text: string,
    images?: Array<{ dataUrl: string; mimeType: string }>,
  ): Promise<void>
  interrupt(sessionId: string): Promise<void>
  respondPermission(
    sessionId: string,
    requestId: string,
    reply: PermissionReply,
  ): Promise<void>
  runClientSlashCommand(
    sessionId: string,
    name: string,
  ): { handled: boolean; message?: string }
}

interface Attachment {
  session: Session
  unsubscribeEvents: () => void
  unsubscribePermissions: () => void
  accumulator: MessageAccumulator
}

// Non-serializable per-session runtime state — kept out of Zustand state.
const attachments = new Map<string, Attachment>()

function isPermissionNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /permission .*not found/i.test(error.message)
}

function detach(sessionId: string): void {
  const a = attachments.get(sessionId)
  if (!a) return
  a.unsubscribeEvents()
  a.unsubscribePermissions()
  attachments.delete(sessionId)
}

function initialState(hostId: number, sessionId: string): ChatPaneState {
  return {
    hostId,
    sessionId,
    status: 'connecting',
    error: null,
    messages: [],
    pendingPermission: null,
    isStreaming: false,
  }
}

function patch(
  state: ChatStoreState,
  sessionId: string,
  updates: Partial<ChatPaneState>,
): ChatStoreState {
  const current = state.byId[sessionId]
  if (!current) return state
  return {
    ...state,
    byId: { ...state.byId, [sessionId]: { ...current, ...updates } },
  }
}

export const useChatStore = create<ChatStoreState>()((set, get) => ({
  byId: {},

  async openSession(hostId, sessionId) {
    // Idempotent: if already attached, just ensure state is present.
    if (attachments.has(sessionId)) {
      if (!get().byId[sessionId]) {
        set((state) => ({
          byId: { ...state.byId, [sessionId]: { ...initialState(hostId, sessionId), status: 'connected' } },
        }))
      }
      return
    }

    set((state) => ({
      byId: { ...state.byId, [sessionId]: initialState(hostId, sessionId) },
    }))

    try {
      const host = await requireHost(hostId)
      const sdk = await connectToHost(host)
      const session = await sdk.resumeSession(sessionId)

      const accumulator = new MessageAccumulator()
      const seenEventIds = new Set<string>()

      try {
        const history = await sdk.getEvents({ sessionId, limit: 500 })
        for (const event of history.items) {
          accumulator.push(event)
          seenEventIds.add(event.id)
        }
      } catch {
        // History fetch is best-effort.
      }

      const handleEvent = (event: SessionEvent) => {
        if (seenEventIds.has(event.id)) return
        seenEventIds.add(event.id)
        accumulator.push(event)
        set((state) => patch(state, sessionId, { messages: [...accumulator.messages] }))
      }
      const handlePermission = (req: SessionPermissionRequest) => {
        const autoAccept = useSettingsStore.getState().autoAcceptPermissions
        if (autoAccept) {
          const preferred: PermissionReply[] = ['always', 'once', 'reject']
          const reply = preferred.find((r) => req.availableReplies.includes(r))
          if (reply && reply !== 'reject') {
            session.respondPermission(req.id, reply).catch((err) => {
              if (isPermissionNotFound(err)) return
              console.error('auto-accept permission failed', err)
              set((state) => patch(state, sessionId, { pendingPermission: req }))
            })
            return
          }
        }
        set((state) => patch(state, sessionId, { pendingPermission: req }))
      }

      const unsubscribeEvents = session.onEvent(handleEvent)
      const unsubscribePermissions = session.onPermissionRequest(handlePermission)

      attachments.set(sessionId, {
        session,
        unsubscribeEvents,
        unsubscribePermissions,
        accumulator,
      })

      set((state) =>
        patch(state, sessionId, {
          status: 'connected',
          messages: [...accumulator.messages],
        }),
      )
    } catch (error) {
      detach(sessionId)
      set((state) =>
        patch(state, sessionId, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to open session',
        }),
      )
    }
  },

  closeSession(sessionId) {
    detach(sessionId)
    set((state) => {
      const { [sessionId]: _removed, ...rest } = state.byId
      void _removed
      return { byId: rest }
    })
  },

  async sendPrompt(sessionId, text, images) {
    const a = attachments.get(sessionId)
    if (!a) throw new Error('No active session')
    set((state) => patch(state, sessionId, { isStreaming: true, error: null }))
    try {
      const contentBlocks: Array<{ type: string; [key: string]: unknown }> = []
      if (images?.length) {
        for (const img of images) {
          const base64 = img.dataUrl.replace(/^data:[^;]+;base64,/, '')
          contentBlocks.push({ type: 'image', data: base64, mimeType: img.mimeType })
        }
      }
      contentBlocks.push({ type: 'text', text })
      await a.session.prompt(contentBlocks as Array<{ type: 'text'; text: string }>)
    } catch (error) {
      set((state) =>
        patch(state, sessionId, {
          error: error instanceof Error ? error.message : 'Prompt failed',
        }),
      )
    } finally {
      set((state) => patch(state, sessionId, { isStreaming: false }))
    }
  },

  async interrupt(sessionId) {
    const a = attachments.get(sessionId)
    if (!a) return
    try {
      await a.session.rawSend('session/cancel', {})
    } catch (error) {
      set((state) =>
        patch(state, sessionId, {
          error: error instanceof Error ? error.message : 'Interrupt failed',
        }),
      )
    }
  },

  async respondPermission(sessionId, requestId, reply) {
    const a = attachments.get(sessionId)
    if (!a) return
    try {
      await a.session.respondPermission(requestId, reply)
      set((state) => {
        const current = state.byId[sessionId]
        if (current?.pendingPermission?.id === requestId) {
          return patch(state, sessionId, { pendingPermission: null })
        }
        return state
      })
    } catch (error) {
      if (isPermissionNotFound(error)) {
        set((state) => {
          const current = state.byId[sessionId]
          if (current?.pendingPermission?.id === requestId) {
            return patch(state, sessionId, { pendingPermission: null })
          }
          return state
        })
        return
      }
      set((state) =>
        patch(state, sessionId, {
          error: error instanceof Error ? error.message : 'Permission reply failed',
        }),
      )
    }
  },

  runClientSlashCommand(sessionId, name) {
    const a = attachments.get(sessionId)
    switch (name) {
      case 'clear':
        if (a) a.accumulator.reset()
        set((state) => patch(state, sessionId, { messages: [] }))
        return { handled: true, message: 'Message display cleared.' }
      case 'compact':
        return {
          handled: false,
          message: 'Send /compact as a prompt; agent support required.',
        }
      case 'undo':
      case 'redo':
        return {
          handled: true,
          message: `/${name} is deferred in v1 (Rivet SDK does not expose revert yet).`,
        }
      default:
        return { handled: false }
    }
  },
}))

// Convenience selector hooks for the common case of "just give me this pane".
export function useChatPane(sessionId: string | undefined): ChatPaneState | undefined {
  return useChatStore((s) => (sessionId ? s.byId[sessionId] : undefined))
}
