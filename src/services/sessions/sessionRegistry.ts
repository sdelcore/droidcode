import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  connectToHost as defaultConnectToHost,
  type ContentBlock,
  type EventEnvelope,
  type PermissionOutcome,
  type PermissionRequestPayload,
  type WagentClient,
} from '@/services/wagent'
import { MessageAccumulator } from '@/services/messaging'
import { decide } from '@/services/messaging/autoAcceptPermission'
import { requireHost } from '@/stores/hostStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Message } from '@/types'

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

export interface ChatPaneSnapshot {
  hostId: number
  sessionId: string
  status: ConnectionState
  error: string | null
  messages: Message[]
  pendingPermission: PermissionRequestPayload | null
  isStreaming: boolean
}

export interface LiveStatusSnapshot {
  sessionId: string
  toolCalls: number
  fileChanges: number
  streaming: boolean
  pendingPermission: boolean
  lastActivityAt?: number
}

export interface SessionHandle {
  release(): void
}

export interface SessionRegistry {
  // Sticky pin — caller commits to manual destroy(). Idempotent: calling
  // twice for the same sessionId is a no-op. Used by the chat pane so the
  // SSE survives StrictMode double-mount + layout swaps.
  attachSticky(hostId: number, sessionId: string): void
  // Ref-counted attachment for transient observers (e.g. live status tiles).
  attach(hostId: number, sessionId: string): SessionHandle

  // useSyncExternalStore plumbing.
  subscribe(sessionId: string, callback: () => void): () => void
  getChatPane(sessionId: string): ChatPaneSnapshot | undefined
  getLiveStatus(sessionId: string): LiveStatusSnapshot | undefined

  // Commands.
  sendMessage(sessionId: string, content: ContentBlock[]): Promise<void>
  abort(sessionId: string): Promise<void>
  respondPermission(
    sessionId: string,
    requestId: string,
    outcome: PermissionOutcome,
  ): Promise<void>
  runClientSlashCommand(
    sessionId: string,
    name: string,
  ): { handled: boolean; message?: string }

  // Force-close. Called by sessionStore.destroySession after the server-side
  // delete succeeds, and internally on a session_destroyed envelope.
  destroy(sessionId: string): void
}

export interface RegistryDeps {
  resolveClient: (hostId: number) => Promise<WagentClient>
  getSettings: () => { autoAcceptPermissions: boolean }
}

// ----------------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------------

interface RegistryEntry {
  hostId: number
  sessionId: string
  client: WagentClient | null
  unsubscribeStream: (() => void) | null
  seenIndices: Set<number>
  lastEventIndex: number
  accumulator: MessageAccumulator
  streamingTimer: ReturnType<typeof setTimeout> | null
  catchUpInFlight: boolean
  refCount: number
  isSticky: boolean
  chatPane: ChatPaneSnapshot
  liveStatus: LiveStatusSnapshot
}

const FILE_EDIT_TOOLS = new Set([
  'Edit',
  'Write',
  'MultiEdit',
  'Create',
  'NotebookEdit',
  'str_replace_editor',
])
const STREAMING_IDLE_MS = 2500

function isFileEditTool(payload: { name?: unknown; title?: unknown }): boolean {
  const name = typeof payload.name === 'string' ? payload.name : ''
  const title = typeof payload.title === 'string' ? payload.title : ''
  return FILE_EDIT_TOOLS.has(name) || FILE_EDIT_TOOLS.has(title)
}

export function createSessionRegistry(deps: RegistryDeps): SessionRegistry {
  const entries = new Map<string, RegistryEntry>()
  // Subscribers live independently of entries so that components can subscribe
  // before the first attach has minted an entry (race between render and
  // sticky-attach effect).
  const subscribers = new Map<string, Set<() => void>>()

  function notify(sessionId: string): void {
    const set = subscribers.get(sessionId)
    if (!set) return
    for (const cb of set) cb()
  }

  function makeChatPane(hostId: number, sessionId: string): ChatPaneSnapshot {
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

  function makeLiveStatus(sessionId: string): LiveStatusSnapshot {
    return {
      sessionId,
      toolCalls: 0,
      fileChanges: 0,
      streaming: false,
      pendingPermission: false,
    }
  }

  function getOrCreate(hostId: number, sessionId: string): RegistryEntry {
    const existing = entries.get(sessionId)
    if (existing) return existing
    const entry: RegistryEntry = {
      hostId,
      sessionId,
      client: null,
      unsubscribeStream: null,
      seenIndices: new Set(),
      lastEventIndex: 0,
      accumulator: new MessageAccumulator(),
      streamingTimer: null,
      catchUpInFlight: false,
      refCount: 0,
      isSticky: false,
      chatPane: makeChatPane(hostId, sessionId),
      liveStatus: makeLiveStatus(sessionId),
    }
    entries.set(sessionId, entry)
    return entry
  }

  function patchChat(entry: RegistryEntry, updates: Partial<ChatPaneSnapshot>): void {
    entry.chatPane = { ...entry.chatPane, ...updates }
  }

  function patchLive(entry: RegistryEntry, updates: Partial<LiveStatusSnapshot>): void {
    entry.liveStatus = { ...entry.liveStatus, ...updates }
  }

  async function openStream(entry: RegistryEntry): Promise<void> {
    if (entry.client) return
    patchChat(entry, { status: 'connecting', error: null })
    notify(entry.sessionId)

    try {
      const client = await deps.resolveClient(entry.hostId)
      entry.client = client

      // Backfill before subscribe so SSE replay uses the seenIndices guard.
      const history = await client
        .listEvents(entry.sessionId, { limit: 2000 })
        .catch(() => [] as EventEnvelope[])
      history.sort((a, b) => a.eventIndex - b.eventIndex)
      for (const e of history) ingestEvent(entry, e)

      entry.unsubscribeStream = client.subscribeEvents(
        entry.sessionId,
        (event) => ingestEvent(entry, event),
        {
          lastEventId: entry.lastEventIndex > 0 ? entry.lastEventIndex : undefined,
        },
      )

      patchChat(entry, {
        status: 'connected',
        messages: [...entry.accumulator.messages],
      })
      notify(entry.sessionId)
    } catch (err) {
      patchChat(entry, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to open session',
      })
      notify(entry.sessionId)
    }
  }

  function ingestEvent(entry: RegistryEntry, event: EventEnvelope): void {
    if (entry.seenIndices.has(event.eventIndex)) return
    entry.seenIndices.add(event.eventIndex)
    if (event.eventIndex > entry.lastEventIndex) entry.lastEventIndex = event.eventIndex

    const chatUpdates: Partial<ChatPaneSnapshot> = {}
    const liveUpdates: Partial<LiveStatusSnapshot> = {}
    let chatChanged = false
    let liveChanged = false

    const payload = event.payload
    switch (payload.kind) {
      case 'tool_call':
        liveUpdates.toolCalls = entry.liveStatus.toolCalls + 1
        liveUpdates.fileChanges =
          entry.liveStatus.fileChanges +
          (isFileEditTool(payload as { name?: unknown; title?: unknown }) ? 1 : 0)
        liveUpdates.lastActivityAt = event.createdAt
        liveChanged = true
        break

      case 'agent_message_chunk':
      case 'agent_thought_chunk':
        if (!entry.liveStatus.streaming) {
          liveUpdates.streaming = true
          liveChanged = true
        }
        liveUpdates.lastActivityAt = event.createdAt
        liveChanged = true
        if (entry.streamingTimer) clearTimeout(entry.streamingTimer)
        entry.streamingTimer = setTimeout(() => {
          if (!entry.liveStatus.streaming) return
          patchLive(entry, { streaming: false })
          notify(entry.sessionId)
        }, STREAMING_IDLE_MS)
        break

      case 'permission_request': {
        const req = payload as unknown as PermissionRequestPayload
        const decision = decide(req, deps.getSettings())
        if (decision.kind === 'auto' && entry.client) {
          // Idempotent server-side; non-fatal on transport error.
          entry.client
            .respondPermission(entry.sessionId, req.requestId, decision.outcome)
            .catch(() => {})
        } else {
          chatUpdates.pendingPermission = req
          liveUpdates.pendingPermission = true
          liveUpdates.lastActivityAt = event.createdAt
          chatChanged = true
          liveChanged = true
        }
        break
      }

      case 'permission_resolved': {
        const reqId = (payload as { requestId?: string }).requestId
        if (entry.chatPane.pendingPermission?.requestId === reqId) {
          chatUpdates.pendingPermission = null
          chatChanged = true
        }
        if (entry.liveStatus.pendingPermission) {
          liveUpdates.pendingPermission = false
          liveChanged = true
        }
        break
      }

      case 'stop':
        if (entry.chatPane.isStreaming) {
          chatUpdates.isStreaming = false
          chatChanged = true
        }
        if (entry.liveStatus.streaming) {
          liveUpdates.streaming = false
          liveChanged = true
        }
        break

      case 'session_destroyed':
        // Server says gone. Force-close; callers see undefined snapshots
        // and can navigate away.
        forceCloseAndDelete(entry)
        notify(entry.sessionId)
        return

      default:
        break
    }

    // Accumulator is the messages projection. permission_* / plan / etc. are
    // no-ops inside it (see accumulator.ts), so this is safe to call always.
    entry.accumulator.push(event)
    chatUpdates.messages = [...entry.accumulator.messages]
    chatChanged = true

    if (chatChanged) patchChat(entry, chatUpdates)
    if (liveChanged) patchLive(entry, liveUpdates)
    if (chatChanged || liveChanged) notify(entry.sessionId)
  }

  function closeStream(entry: RegistryEntry): void {
    if (entry.unsubscribeStream) {
      try {
        entry.unsubscribeStream()
      } catch {
        // ignore
      }
      entry.unsubscribeStream = null
    }
    if (entry.streamingTimer) {
      clearTimeout(entry.streamingTimer)
      entry.streamingTimer = null
    }
    entry.client = null
  }

  function forceCloseAndDelete(entry: RegistryEntry): void {
    closeStream(entry)
    entries.delete(entry.sessionId)
  }

  function maybeClose(entry: RegistryEntry): void {
    if (entry.isSticky || entry.refCount > 0) return
    forceCloseAndDelete(entry)
  }

  // Catch-up loop on visibility/focus/online — wagent's SSE keep-alive +
  // Last-Event-ID resume handles most cases server-side; this covers the
  // residual silent-stall window on mobile.
  async function catchUpEntry(entry: RegistryEntry): Promise<void> {
    if (!entry.client || entry.catchUpInFlight) return
    entry.catchUpInFlight = true
    try {
      const events = await entry.client
        .listEvents(entry.sessionId, { after: entry.lastEventIndex, limit: 1000 })
        .catch(() => [] as EventEnvelope[])
      for (const e of events) ingestEvent(entry, e)
    } finally {
      entry.catchUpInFlight = false
    }
  }

  function catchUpAll(): void {
    for (const entry of entries.values()) void catchUpEntry(entry)
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') catchUpAll()
    })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', catchUpAll)
    window.addEventListener('focus', catchUpAll)
  }

  return {
    attachSticky(hostId, sessionId) {
      const entry = getOrCreate(hostId, sessionId)
      entry.isSticky = true
      if (!entry.client) void openStream(entry)
    },

    attach(hostId, sessionId) {
      const entry = getOrCreate(hostId, sessionId)
      entry.refCount += 1
      if (!entry.client) void openStream(entry)
      return {
        release() {
          entry.refCount -= 1
          if (entry.refCount < 0) entry.refCount = 0
          maybeClose(entry)
        },
      }
    },

    subscribe(sessionId, callback) {
      let set = subscribers.get(sessionId)
      if (!set) {
        set = new Set()
        subscribers.set(sessionId, set)
      }
      set.add(callback)
      return () => {
        const current = subscribers.get(sessionId)
        if (!current) return
        current.delete(callback)
        if (current.size === 0) subscribers.delete(sessionId)
      }
    },

    getChatPane(sessionId) {
      return entries.get(sessionId)?.chatPane
    },

    getLiveStatus(sessionId) {
      return entries.get(sessionId)?.liveStatus
    },

    async sendMessage(sessionId, content) {
      const entry = entries.get(sessionId)
      if (!entry?.client) throw new Error('No active session')
      patchChat(entry, { isStreaming: true, error: null })
      notify(sessionId)
      try {
        await entry.client.sendMessage(sessionId, content)
      } catch (err) {
        patchChat(entry, {
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Prompt failed',
        })
        notify(sessionId)
        throw err
      }
    },

    async abort(sessionId) {
      const entry = entries.get(sessionId)
      if (!entry?.client) return
      try {
        await entry.client.abort(sessionId)
      } catch (err) {
        patchChat(entry, {
          error: err instanceof Error ? err.message : 'Interrupt failed',
        })
        notify(sessionId)
      }
    },

    async respondPermission(sessionId, requestId, outcome) {
      const entry = entries.get(sessionId)
      if (!entry?.client) return
      try {
        await entry.client.respondPermission(sessionId, requestId, outcome)
        // Optimistic clear; server will also fire permission_resolved which
        // is a no-op if pendingPermission is already null.
        let changed = false
        if (entry.chatPane.pendingPermission?.requestId === requestId) {
          patchChat(entry, { pendingPermission: null })
          changed = true
        }
        if (entry.liveStatus.pendingPermission) {
          patchLive(entry, { pendingPermission: false })
          changed = true
        }
        if (changed) notify(sessionId)
      } catch (err) {
        patchChat(entry, {
          error: err instanceof Error ? err.message : 'Permission reply failed',
        })
        notify(sessionId)
      }
    },

    runClientSlashCommand(sessionId, name) {
      const entry = entries.get(sessionId)
      switch (name) {
        case 'clear':
          if (entry) {
            entry.accumulator.reset()
            patchChat(entry, { messages: [] })
            notify(sessionId)
          }
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

    destroy(sessionId) {
      const entry = entries.get(sessionId)
      if (!entry) return
      forceCloseAndDelete(entry)
      notify(sessionId)
    },
  }
}

// ----------------------------------------------------------------------------
// Production singleton
// ----------------------------------------------------------------------------

export const sessionRegistry = createSessionRegistry({
  resolveClient: async (hostId) => {
    const host = await requireHost(hostId)
    return defaultConnectToHost(host)
  },
  getSettings: () => ({
    autoAcceptPermissions: useSettingsStore.getState().autoAcceptPermissions,
  }),
})

// ----------------------------------------------------------------------------
// Free commands — bound to the singleton.
// ----------------------------------------------------------------------------

export function sendPrompt(
  sessionId: string,
  text: string,
  images?: Array<{ dataUrl: string; mimeType: string }>,
): Promise<void> {
  const content: ContentBlock[] = []
  if (images?.length) {
    for (const img of images) {
      const base64 = img.dataUrl.replace(/^data:[^;]+;base64,/, '')
      content.push({ type: 'image', data: base64, mimeType: img.mimeType })
    }
  }
  if (text) content.push({ type: 'text', text })
  if (content.length === 0) return Promise.resolve()
  return sessionRegistry.sendMessage(sessionId, content)
}

export function interrupt(sessionId: string): Promise<void> {
  return sessionRegistry.abort(sessionId)
}

export function respondPermission(
  sessionId: string,
  requestId: string,
  outcome: PermissionOutcome,
): Promise<void> {
  return sessionRegistry.respondPermission(sessionId, requestId, outcome)
}

export function runClientSlashCommand(
  sessionId: string,
  name: string,
): { handled: boolean; message?: string } {
  return sessionRegistry.runClientSlashCommand(sessionId, name)
}

export function destroySessionData(sessionId: string): void {
  sessionRegistry.destroy(sessionId)
}

// ----------------------------------------------------------------------------
// React hooks
// ----------------------------------------------------------------------------

export function useChatPane(sessionId: string | undefined): ChatPaneSnapshot | undefined {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!sessionId) return () => {}
      return sessionRegistry.subscribe(sessionId, cb)
    },
    [sessionId],
  )
  const getSnapshot = useCallback(
    () => (sessionId ? sessionRegistry.getChatPane(sessionId) : undefined),
    [sessionId],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useLiveStatus(sessionId: string): LiveStatusSnapshot | undefined {
  const subscribe = useCallback(
    (cb: () => void) => sessionRegistry.subscribe(sessionId, cb),
    [sessionId],
  )
  const getSnapshot = useCallback(
    () => sessionRegistry.getLiveStatus(sessionId),
    [sessionId],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Sticky-pin a chat session. The handle leaks deliberately: see AGENTS.md
// "Chat attachments are app-scoped" — every component unmount (StrictMode
// double-mount, layout swap, nav-away-and-back) would otherwise tear down
// the SSE + accumulator. Only sessionStore.destroySession() releases the pin.
export function useStickyChat(hostId: number, sessionId: string): ChatPaneSnapshot | undefined {
  useEffect(() => {
    sessionRegistry.attachSticky(hostId, sessionId)
  }, [hostId, sessionId])
  return useChatPane(sessionId)
}

// Ref-counted live-status subscription. Releases on unmount; closes the
// stream when the last subscriber drops (and no sticky chat is pinned).
export function useWatchLive(hostId: number, sessionId: string): LiveStatusSnapshot | undefined {
  useEffect(() => {
    const handle = sessionRegistry.attach(hostId, sessionId)
    return () => handle.release()
  }, [hostId, sessionId])
  return useLiveStatus(sessionId)
}

// Ref-counted live-status for many sessions at once (home grid, sidebar).
// Single useEffect handles attach+release for all entries in one pass.
export function useWatchLiveMany(refs: Array<{ hostId: number; sessionId: string }>): void {
  // Stable JSON key so the effect doesn't re-fire on every render due to
  // identity-only changes in the array.
  const key = refs.map((r) => `${r.hostId}:${r.sessionId}`).join(',')
  useEffect(() => {
    const handles = refs.map((r) => sessionRegistry.attach(r.hostId, r.sessionId))
    return () => {
      for (const h of handles) h.release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
