import { create } from 'zustand'
import type { Session, SessionEvent, SessionPermissionRequest, PermissionReply } from 'sandbox-agent'
import { connectToHost } from '@/services/sandboxAgent/client'
import { MessageAccumulator } from '@/services/messaging'
import { listEvents as companionListEvents, type CompanionEvent } from '@/services/sync/companion'
import {
  attachEventMirror,
  detachEventMirror,
  enqueueEvent,
} from '@/services/sync/eventMirror'
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
  hostId: number
  sessionId: string
  session: Session
  unsubscribeEvents: () => void
  unsubscribePermissions: () => void
  accumulator: MessageAccumulator
  seenEventIds: Set<string>
  lastEventIndex: number
  catchUpInFlight: boolean
}

function companionEventToSdkEvent(e: CompanionEvent): SessionEvent {
  return {
    id: e.id,
    eventIndex: e.eventIndex,
    sessionId: e.sessionId,
    createdAt: e.createdAt,
    connectionId: e.connectionId ?? '',
    sender: e.sender,
    payload: e.payload as SessionEvent['payload'],
  }
}

// Non-serializable per-session runtime state — kept out of Zustand state.
const attachments = new Map<string, Attachment>()

// Defensive catch-up: the SDK's SSE connection can go silently stale on
// mobile (backgrounded tab, sleep, network switch) and we don't get a
// failure event — we just stop receiving updates. When the window comes
// back to focus or the browser reports online, ask the companion for
// everything after our last seen eventIndex and push any gaps through
// the same handleEvent path. Dedupe is by event id so double-pushes
// from SSE + poll are safe.
async function catchUpAttachment(a: Attachment): Promise<void> {
  if (a.catchUpInFlight) return
  a.catchUpInFlight = true
  try {
    const host = await requireHost(a.hostId).catch(() => null)
    if (!host) return
    const items = await companionListEvents(host, a.sessionId, {
      after: a.lastEventIndex,
      limit: 1000,
    }).catch(() => [] as CompanionEvent[])
    if (items.length === 0) return
    const events = items.map(companionEventToSdkEvent)
    events.sort((x, y) => x.eventIndex - y.eventIndex)
    let appended = false
    for (const e of events) {
      if (a.seenEventIds.has(e.id)) continue
      a.seenEventIds.add(e.id)
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

function isPermissionNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /permission .*not found/i.test(error.message)
}

function detach(sessionId: string): void {
  const a = attachments.get(sessionId)
  if (!a) return
  a.unsubscribeEvents()
  a.unsubscribePermissions()
  detachEventMirror(a.hostId, sessionId)
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
      let lastEventIndex = 0

      // Collect history from both sides: SDK's local persist (might have
      // stuff the companion doesn't yet) + companion server (authoritative
      // cross-device view). Dedupe by id and replay in eventIndex order
      // so tool calls and text chunks interleave correctly.
      const [localHistory, remoteHistory] = await Promise.all([
        sdk.getEvents({ sessionId, limit: 1000 }).catch(() => ({ items: [] as SessionEvent[] })),
        companionListEvents(host, sessionId, { limit: 2000 })
          .then((items) => items.map(companionEventToSdkEvent))
          .catch(() => [] as SessionEvent[]),
      ])
      const merged: SessionEvent[] = []
      for (const e of [...localHistory.items, ...remoteHistory]) {
        if (seenEventIds.has(e.id)) continue
        seenEventIds.add(e.id)
        merged.push(e)
      }
      merged.sort((a, b) => a.eventIndex - b.eventIndex)
      for (const e of merged) {
        accumulator.push(e)
        if (e.eventIndex > lastEventIndex) lastEventIndex = e.eventIndex
      }

      attachEventMirror(host, sessionId)
      // Backfill: push any history events the companion didn't already
      // have so the other browsers eventually see them too.
      for (const e of merged) enqueueEvent(host.id, sessionId, e)

      const handleEvent = (event: SessionEvent) => {
        if (seenEventIds.has(event.id)) return
        seenEventIds.add(event.id)
        if (event.eventIndex > lastEventIndex) lastEventIndex = event.eventIndex
        const a = attachments.get(sessionId)
        if (a) a.lastEventIndex = lastEventIndex
        accumulator.push(event)
        enqueueEvent(host.id, sessionId, event)
        set((state) => patch(state, sessionId, { messages: [...accumulator.messages] }))
      }
      const handlePermission = (req: SessionPermissionRequest) => {
        const autoAccept = useSettingsStore.getState().autoAcceptPermissions
        if (autoAccept) {
          const preferred: PermissionReply[] = ['always', 'once', 'reject']
          const reply = preferred.find((r) => req.availableReplies.includes(r))
          if (reply && reply !== 'reject') {
            session.respondPermission(req.id, reply).then(
              () => {
                useSessionLiveStore.getState().clearPendingPermission(sessionId)
              },
              (err) => {
                if (isPermissionNotFound(err)) {
                  useSessionLiveStore.getState().clearPendingPermission(sessionId)
                  return
                }
                console.error('auto-accept permission failed', err)
                set((state) => patch(state, sessionId, { pendingPermission: req }))
              },
            )
            return
          }
        }
        set((state) => patch(state, sessionId, { pendingPermission: req }))
      }

      const unsubscribeEvents = session.onEvent(handleEvent)
      const unsubscribePermissions = session.onPermissionRequest(handlePermission)

      attachments.set(sessionId, {
        hostId,
        sessionId,
        session,
        unsubscribeEvents,
        unsubscribePermissions,
        accumulator,
        seenEventIds,
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
    const clearBanner = () => {
      set((state) => {
        const current = state.byId[sessionId]
        if (current?.pendingPermission?.id === requestId) {
          return patch(state, sessionId, { pendingPermission: null })
        }
        return state
      })
      useSessionLiveStore.getState().clearPendingPermission(sessionId)
    }
    try {
      await a.session.respondPermission(requestId, reply)
      clearBanner()
    } catch (error) {
      if (isPermissionNotFound(error)) {
        clearBanner()
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
