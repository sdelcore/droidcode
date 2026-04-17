import { create } from 'zustand'
import type { Session, SessionEvent, SessionPermissionRequest, PermissionReply } from 'sandbox-agent'
import { connectToHost } from '@/services/sandboxAgent/client'
import { MessageAccumulator } from '@/services/messaging'
import { requireHost } from './hostStore'
import { useSettingsStore } from './settingsStore'
import type { Message } from '@/types'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface ChatStoreState {
  hostId: number | null
  sessionId: string | null
  status: ConnectionStatus
  error: string | null
  messages: Message[]
  pendingPermission: SessionPermissionRequest | null
  isStreaming: boolean

  openSession(hostId: number, sessionId: string): Promise<void>
  closeSession(): void
  sendPrompt(text: string, images?: Array<{ dataUrl: string; mimeType: string }>): Promise<void>
  interrupt(): Promise<void>
  respondPermission(requestId: string, reply: PermissionReply): Promise<void>
  runClientSlashCommand(name: string): { handled: boolean; message?: string }
}

interface Attachment {
  session: Session
  unsubscribeEvents: () => void
  unsubscribePermissions: () => void
  accumulator: MessageAccumulator
}

let attached: Attachment | null = null

function isPermissionNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /permission .*not found/i.test(error.message)
}

function detach(): void {
  if (!attached) return
  attached.unsubscribeEvents()
  attached.unsubscribePermissions()
  attached = null
}

export const useChatStore = create<ChatStoreState>()((set, get) => ({
  hostId: null,
  sessionId: null,
  status: 'idle',
  error: null,
  messages: [],
  pendingPermission: null,
  isStreaming: false,

  async openSession(hostId, sessionId) {
    detach()
    set({
      hostId,
      sessionId,
      status: 'connecting',
      error: null,
      messages: [],
      pendingPermission: null,
      isStreaming: false,
    })

    try {
      const host = await requireHost(hostId)
      const sdk = await connectToHost(host)
      const session = await sdk.resumeSession(sessionId)

      const accumulator = new MessageAccumulator()
      const seenEventIds = new Set<string>()

      // Replay history before subscribing so the bubble list reflects the
      // full conversation the moment we connect. Events that also arrive
      // through onEvent are deduped by id.
      try {
        const history = await sdk.getEvents({ sessionId, limit: 500 })
        for (const event of history.items) {
          accumulator.push(event)
          seenEventIds.add(event.id)
        }
      } catch {
        // History fetch is best-effort; live events are enough to be useful.
      }

      const handleEvent = (event: SessionEvent) => {
        if (seenEventIds.has(event.id)) return
        seenEventIds.add(event.id)
        accumulator.push(event)
        set({ messages: [...accumulator.messages] })
      }
      const handlePermission = (req: SessionPermissionRequest) => {
        const autoAccept = useSettingsStore.getState().autoAcceptPermissions
        if (autoAccept) {
          // Prefer "always" so the agent stops asking for the same tool type;
          // fall back to "once" or "reject" if the daemon didn't offer it.
          const preferred: PermissionReply[] = ['always', 'once', 'reject']
          const reply = preferred.find((r) => req.availableReplies.includes(r))
          if (reply && reply !== 'reject') {
            session.respondPermission(req.id, reply).catch((err) => {
              // If the permission was already resolved (double-fire on
              // resume/replay), there's nothing to do — don't surface it.
              if (isPermissionNotFound(err)) return
              console.error('auto-accept permission failed', err)
              set({ pendingPermission: req })
            })
            return
          }
        }
        set({ pendingPermission: req })
      }

      const unsubscribeEvents = session.onEvent(handleEvent)
      const unsubscribePermissions = session.onPermissionRequest(handlePermission)

      attached = {
        session,
        unsubscribeEvents,
        unsubscribePermissions,
        accumulator,
      }

      set({
        status: 'connected',
        messages: [...accumulator.messages],
      })
    } catch (error) {
      detach()
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to open session',
      })
    }
  },

  closeSession() {
    detach()
    set({
      hostId: null,
      sessionId: null,
      status: 'idle',
      messages: [],
      pendingPermission: null,
      isStreaming: false,
    })
  },

  async sendPrompt(text, images) {
    if (!attached) throw new Error('No active session')
    // The user message gets added when the daemon echoes back the
    // session/prompt event through onEvent — same path as on resume —
    // so both live chat and history share one source of truth.
    set({ isStreaming: true, error: null })
    try {
      const contentBlocks: Array<{ type: string; [key: string]: unknown }> = []
      if (images?.length) {
        for (const img of images) {
          const base64 = img.dataUrl.replace(/^data:[^;]+;base64,/, '')
          contentBlocks.push({ type: 'image', data: base64, mimeType: img.mimeType })
        }
      }
      contentBlocks.push({ type: 'text', text })
      await attached.session.prompt(contentBlocks as Array<{ type: 'text'; text: string }>)
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Prompt failed',
      })
    } finally {
      set({ isStreaming: false })
    }
  },

  async interrupt() {
    if (!attached) return
    try {
      await attached.session.rawSend('session/cancel', {})
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Interrupt failed',
      })
    }
  },

  async respondPermission(requestId, reply) {
    if (!attached) return
    try {
      await attached.session.respondPermission(requestId, reply)
      if (get().pendingPermission?.id === requestId) {
        set({ pendingPermission: null })
      }
    } catch (error) {
      if (isPermissionNotFound(error)) {
        // Stale permission (already resolved upstream). Clear the banner
        // quietly instead of showing a scary red error.
        if (get().pendingPermission?.id === requestId) {
          set({ pendingPermission: null })
        }
        return
      }
      set({
        error: error instanceof Error ? error.message : 'Permission reply failed',
      })
    }
  },

  runClientSlashCommand(name) {
    switch (name) {
      case 'clear':
        if (attached) attached.accumulator.reset()
        set({ messages: [] })
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
