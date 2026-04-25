import { create } from 'zustand'
import type {
  ContentBlock,
  EventEnvelope,
  PermissionOutcome,
  PermissionRequestPayload,
  WagentClient,
} from '@/services/wagent'
import { connectToHost } from '@/services/wagent'
import { MessageAccumulator } from '@/services/messaging'
import { requireHost } from './hostStore'
import { useSessionLiveStore } from './sessionLiveStore'
import { useSettingsStore } from './settingsStore'
import type { Message } from '@/types'

export type ChatStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface ChatPaneState {
  hostId: number
  sessionId: string
  status: ChatStatus
  error: string | null
  messages: Message[]
  pendingPermission: PermissionRequestPayload | null
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
    outcome: PermissionOutcome,
  ): Promise<void>
  runClientSlashCommand(
    sessionId: string,
    name: string,
  ): { handled: boolean; message?: string }
}

interface Attachment {
  hostId: number
  sessionId: string
  client: WagentClient
  unsubscribeEvents: () => void
  accumulator: MessageAccumulator
  seenIndices: Set<number>
  lastEventIndex: number
  catchUpInFlight: boolean
}

const attachments = new Map<string, Attachment>()

// Defensive catch-up on focus / online — wagent's SSE keep-alive +
// Last-Event-ID resume should handle most cases server-side, but this
// covers the residual silent-stall window on mobile.
async function catchUpAttachment(a: Attachment): Promise<void> {
  if (a.catchUpInFlight) return
  a.catchUpInFlight = true
  try {
    const events = await a.client
      .listEvents(a.sessionId, { after: a.lastEventIndex, limit: 1000 })
      .catch(() => [] as EventEnvelope[])
    if (events.length === 0) return
    let appended = false
    for (const e of events) {
      if (a.seenIndices.has(e.eventIndex)) continue
      a.seenIndices.add(e.eventIndex)
      if (e.eventIndex > a.lastEventIndex) a.lastEventIndex = e.eventIndex
      a.accumulator.push(e)
      appended = true
    }
    if (appended) {
      useChatStore.setState((state) =>
        patch(state, a.sessionId, { messages: [...a.accumulator.messages] }),
      )
    }
  } finally {
    a.catchUpInFlight = false
  }
}

function catchUpAll(): void {
  for (const a of attachments.values()) void catchUpAttachment(a)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') catchUpAll()
  })
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => catchUpAll())
  window.addEventListener('focus', () => catchUpAll())
}

function detach(sessionId: string): void {
  const a = attachments.get(sessionId)
  if (!a) return
  a.unsubscribeEvents()
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
    if (attachments.has(sessionId)) {
      if (!get().byId[sessionId]) {
        set((state) => ({
          byId: {
            ...state.byId,
            [sessionId]: { ...initialState(hostId, sessionId), status: 'connected' },
          },
        }))
      }
      return
    }

    set((state) => ({
      byId: { ...state.byId, [sessionId]: initialState(hostId, sessionId) },
    }))

    try {
      const host = await requireHost(hostId)
      const client = connectToHost(host)

      const accumulator = new MessageAccumulator()
      const seenIndices = new Set<number>()
      let lastEventIndex = 0

      // Backfill from server before subscribing live so SSE replay
      // doesn't double up via Last-Event-ID racing the listEvents call.
      const history = await client.listEvents(sessionId, { limit: 2000 }).catch(() => [])
      history.sort((a, b) => a.eventIndex - b.eventIndex)
      for (const e of history) {
        seenIndices.add(e.eventIndex)
        if (e.eventIndex > lastEventIndex) lastEventIndex = e.eventIndex
        accumulator.push(e)
      }

      const handleEvent = (event: EventEnvelope) => {
        if (seenIndices.has(event.eventIndex)) return
        seenIndices.add(event.eventIndex)
        if (event.eventIndex > lastEventIndex) lastEventIndex = event.eventIndex
        const a = attachments.get(sessionId)
        if (a) a.lastEventIndex = lastEventIndex

        // Top-level chatStore reactions to specific event kinds.
        switch (event.payload.kind) {
          case 'permission_request':
            handlePermissionRequest(client, sessionId, event.payload as unknown as PermissionRequestPayload)
            break
          case 'permission_resolved':
            // Clear banner if it matches this requestId.
            set((state) => {
              const current = state.byId[sessionId]
              const reqId = (event.payload as { requestId?: string }).requestId
              if (current?.pendingPermission?.requestId === reqId) {
                return patch(state, sessionId, { pendingPermission: null })
              }
              return state
            })
            useSessionLiveStore.getState().clearPendingPermission(sessionId)
            break
          case 'stop':
            set((state) => patch(state, sessionId, { isStreaming: false }))
            break
          case 'session_destroyed':
            // Server says session is gone — close the attachment.
            detach(sessionId)
            return
          default:
            break
        }

        accumulator.push(event)
        set((state) => patch(state, sessionId, { messages: [...accumulator.messages] }))
      }

      // Subscribe AFTER backfill so duplicates use the seenIndices guard.
      const unsubscribe = client.subscribeEvents(sessionId, handleEvent, {
        lastEventId: lastEventIndex > 0 ? lastEventIndex : undefined,
      })

      attachments.set(sessionId, {
        hostId,
        sessionId,
        client,
        unsubscribeEvents: unsubscribe,
        accumulator,
        seenIndices,
        lastEventIndex,
        catchUpInFlight: false,
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
      const content: ContentBlock[] = []
      if (images?.length) {
        for (const img of images) {
          const base64 = img.dataUrl.replace(/^data:[^;]+;base64,/, '')
          content.push({ type: 'image', data: base64, mimeType: img.mimeType })
        }
      }
      if (text) content.push({ type: 'text', text })
      if (content.length === 0) return
      await a.client.sendMessage(sessionId, content)
    } catch (error) {
      set((state) =>
        patch(state, sessionId, {
          error: error instanceof Error ? error.message : 'Prompt failed',
          isStreaming: false,
        }),
      )
    }
  },

  async interrupt(sessionId) {
    const a = attachments.get(sessionId)
    if (!a) return
    try {
      await a.client.abort(sessionId)
    } catch (error) {
      set((state) =>
        patch(state, sessionId, {
          error: error instanceof Error ? error.message : 'Interrupt failed',
        }),
      )
    }
  },

  async respondPermission(sessionId, requestId, outcome) {
    const a = attachments.get(sessionId)
    if (!a) return
    const clearBanner = () => {
      set((state) => {
        const current = state.byId[sessionId]
        if (current?.pendingPermission?.requestId === requestId) {
          return patch(state, sessionId, { pendingPermission: null })
        }
        return state
      })
      useSessionLiveStore.getState().clearPendingPermission(sessionId)
    }
    try {
      await a.client.respondPermission(sessionId, requestId, outcome)
      clearBanner()
    } catch (error) {
      // wagent dedupes server-side and returns 200 on already-consumed
      // request ids; this catch is for actual transport errors.
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
          message: `/${name} is deferred in v1 (no revert primitive yet).`,
        }
      default:
        return { handled: false }
    }
  },
}))

function handlePermissionRequest(
  client: WagentClient,
  sessionId: string,
  req: PermissionRequestPayload,
): void {
  const autoAccept = useSettingsStore.getState().autoAcceptPermissions
  if (autoAccept) {
    const preferred: PermissionOutcome[] = ['allow_always', 'allow_once', 'reject']
    const outcome = preferred.find((o) => req.availableOutcomes?.includes(o))
    if (outcome && outcome !== 'reject') {
      client.respondPermission(sessionId, req.requestId, outcome).catch(() => {
        // Idempotent server-side — non-fatal.
      })
      return
    }
  }
  useChatStore.setState((state) => patch(state, sessionId, { pendingPermission: req }))
}

export function useChatPane(sessionId: string | undefined): ChatPaneState | undefined {
  return useChatStore((s) => (sessionId ? s.byId[sessionId] : undefined))
}
