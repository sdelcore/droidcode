import { create } from 'zustand'
import type { Session, SessionEvent, SessionPermissionRequest, PermissionReply } from 'sandbox-agent'
import { connectToHost } from '@/services/sandboxAgent/client'
import { MessageAccumulator } from '@/services/messaging'
import { useHostStore } from './hostStore'
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
  sendPrompt(text: string): Promise<void>
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
      const host = useHostStore.getState().hosts.find((h) => h.id === hostId)
      if (!host) throw new Error(`Host ${hostId} not found`)
      const sdk = await connectToHost(host)
      const session = await sdk.resumeSession(sessionId)

      const accumulator = new MessageAccumulator()

      const handleEvent = (event: SessionEvent) => {
        accumulator.push(event)
        set({ messages: [...accumulator.messages] })
      }
      const handlePermission = (req: SessionPermissionRequest) => {
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

      set({ status: 'connected' })
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

  async sendPrompt(text) {
    if (!attached) throw new Error('No active session')
    set({ isStreaming: true, error: null })
    try {
      await attached.session.prompt([{ type: 'text', text }])
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
