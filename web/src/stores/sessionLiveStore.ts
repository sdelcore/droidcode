import { create } from 'zustand'
import type { Session, SessionEvent, SessionPermissionRequest } from 'sandbox-agent'
import { connectToHost } from '@/services/sandboxAgent/client'
import { requireHost } from './hostStore'

export interface LiveSessionStatus {
  sessionId: string
  toolCalls: number
  fileChanges: number
  streaming: boolean
  pendingPermission: boolean
  lastActivityAt?: number
}

interface WatchEntry {
  session: Session
  unsubEvents: () => void
  unsubPermissions: () => void
  watchers: number
  streamingTimer: ReturnType<typeof setTimeout> | null
}

interface SessionLiveStoreState {
  statuses: Record<string, LiveSessionStatus>
  watch(hostId: number, sessionId: string): Promise<void>
  unwatch(hostId: number, sessionId: string): void
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

// Entry map lives outside the store because Session/timer handles aren't
// serializable and we don't want React touching them.
const entries = new Map<string, WatchEntry>()

function key(hostId: number, sessionId: string) {
  return `${hostId}:${sessionId}`
}

function countsFromEvent(event: SessionEvent): {
  tool: boolean
  fileEdit: boolean
  agentChunk: boolean
} {
  const payload = event.payload as { method?: string; params?: unknown } | null
  if (!payload || payload.method !== 'session/update') {
    return { tool: false, fileEdit: false, agentChunk: false }
  }
  const params = payload.params as
    | { update?: { sessionUpdate?: string; title?: string; _meta?: { claudeCode?: { toolName?: string } } } }
    | undefined
  const update = params?.update
  if (!update) return { tool: false, fileEdit: false, agentChunk: false }

  if (update.sessionUpdate === 'tool_call') {
    const toolName = update._meta?.claudeCode?.toolName ?? update.title ?? ''
    return { tool: true, fileEdit: FILE_EDIT_TOOLS.has(toolName), agentChunk: false }
  }
  if (update.sessionUpdate === 'agent_message_chunk' || update.sessionUpdate === 'agent_thought_chunk') {
    return { tool: false, fileEdit: false, agentChunk: true }
  }
  return { tool: false, fileEdit: false, agentChunk: false }
}

export const useSessionLiveStore = create<SessionLiveStoreState>()((set, get) => ({
  statuses: {},

  async watch(hostId, sessionId) {
    const k = key(hostId, sessionId)
    const existing = entries.get(k)
    if (existing) {
      existing.watchers += 1
      return
    }

    // Register a placeholder status immediately so UI doesn't flicker.
    if (!get().statuses[sessionId]) {
      set((state) => ({
        statuses: {
          ...state.statuses,
          [sessionId]: {
            sessionId,
            toolCalls: 0,
            fileChanges: 0,
            streaming: false,
            pendingPermission: false,
          },
        },
      }))
    }

    const entry: WatchEntry = {
      session: null as unknown as Session,
      unsubEvents: () => {},
      unsubPermissions: () => {},
      watchers: 1,
      streamingTimer: null,
    }
    entries.set(k, entry)

    try {
      const host = await requireHost(hostId)
      const sdk = await connectToHost(host)
      const session = await sdk.resumeSession(sessionId)
      entry.session = session

      const applyEventCounts = (event: SessionEvent) => {
        const counts = countsFromEvent(event)
        if (!counts.tool && !counts.fileEdit && !counts.agentChunk) return

        set((state) => {
          const current = state.statuses[sessionId]
          if (!current) return state
          const next: LiveSessionStatus = {
            ...current,
            toolCalls: current.toolCalls + (counts.tool ? 1 : 0),
            fileChanges: current.fileChanges + (counts.fileEdit ? 1 : 0),
            streaming: counts.agentChunk ? true : current.streaming,
            lastActivityAt: event.createdAt,
          }
          return { statuses: { ...state.statuses, [sessionId]: next } }
        })

        if (counts.agentChunk) {
          if (entry.streamingTimer) clearTimeout(entry.streamingTimer)
          entry.streamingTimer = setTimeout(() => {
            set((state) => {
              const current = state.statuses[sessionId]
              if (!current || !current.streaming) return state
              return {
                statuses: {
                  ...state.statuses,
                  [sessionId]: { ...current, streaming: false },
                },
              }
            })
          }, STREAMING_IDLE_MS)
        }
      }

      const applyPermission = (req: SessionPermissionRequest) => {
        set((state) => {
          const current = state.statuses[sessionId]
          if (!current) return state
          return {
            statuses: {
              ...state.statuses,
              [sessionId]: { ...current, pendingPermission: true, lastActivityAt: req.createdAt },
            },
          }
        })
      }

      // Historical counts: scan once up to a generous limit.
      try {
        const page = await sdk.getEvents({ sessionId, limit: 500 })
        let tool = 0
        let fileEdit = 0
        let lastActivityAt: number | undefined
        for (const event of page.items) {
          const counts = countsFromEvent(event)
          if (counts.tool) tool++
          if (counts.fileEdit) fileEdit++
          if (counts.tool || counts.agentChunk) lastActivityAt = event.createdAt
        }
        set((state) => {
          const current = state.statuses[sessionId]
          if (!current) return state
          return {
            statuses: {
              ...state.statuses,
              [sessionId]: {
                ...current,
                toolCalls: tool,
                fileChanges: fileEdit,
                lastActivityAt,
              },
            },
          }
        })
      } catch {
        // Best-effort; counts will accumulate from live events.
      }

      entry.unsubEvents = session.onEvent(applyEventCounts)
      entry.unsubPermissions = session.onPermissionRequest(applyPermission)
    } catch {
      // Failed to attach — leave the entry so repeat watch() calls don't
      // retry endlessly, but keep the placeholder status so the tile
      // renders something sensible.
      entries.delete(k)
    }
  },

  unwatch(hostId, sessionId) {
    const k = key(hostId, sessionId)
    const entry = entries.get(k)
    if (!entry) return
    entry.watchers -= 1
    if (entry.watchers > 0) return

    entry.unsubEvents()
    entry.unsubPermissions()
    if (entry.streamingTimer) clearTimeout(entry.streamingTimer)
    entries.delete(k)

    set((state) => {
      const { [sessionId]: _removed, ...rest } = state.statuses
      void _removed
      return { statuses: rest }
    })
  },
}))

export function useLiveStatus(sessionId: string): LiveSessionStatus | undefined {
  return useSessionLiveStore((s) => s.statuses[sessionId])
}
