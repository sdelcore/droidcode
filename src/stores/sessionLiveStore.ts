import { create } from 'zustand'
import type {
  EventEnvelope,
  PermissionOutcome,
  PermissionRequestPayload,
  WagentClient,
} from '@/services/wagent'
import { connectToHost } from '@/services/wagent'
import { requireHost } from './hostStore'
import { useSettingsStore } from './settingsStore'

export interface LiveSessionStatus {
  sessionId: string
  toolCalls: number
  fileChanges: number
  streaming: boolean
  pendingPermission: boolean
  lastActivityAt?: number
}

interface WatchEntry {
  client: WagentClient
  unsubscribe: () => void
  watchers: number
  streamingTimer: ReturnType<typeof setTimeout> | null
}

interface SessionLiveStoreState {
  statuses: Record<string, LiveSessionStatus>
  watch(hostId: number, sessionId: string): Promise<void>
  unwatch(hostId: number, sessionId: string): void
  clearPendingPermission(sessionId: string): void
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

const entries = new Map<string, WatchEntry>()

function key(hostId: number, sessionId: string) {
  return `${hostId}:${sessionId}`
}

function isFileEditTool(payload: { name?: unknown; title?: unknown }): boolean {
  const name = typeof payload.name === 'string' ? payload.name : ''
  const title = typeof payload.title === 'string' ? payload.title : ''
  return FILE_EDIT_TOOLS.has(name) || FILE_EDIT_TOOLS.has(title)
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
      client: null as unknown as WagentClient,
      unsubscribe: () => {},
      watchers: 1,
      streamingTimer: null,
    }
    entries.set(k, entry)

    try {
      const host = await requireHost(hostId)
      const client = connectToHost(host)
      entry.client = client

      // Backfill counts from history.
      try {
        const history = await client.listEvents(sessionId, { limit: 500 })
        let tool = 0
        let fileEdit = 0
        let lastActivityAt: number | undefined
        for (const e of history) {
          if (e.payload.kind === 'tool_call') {
            tool++
            if (isFileEditTool(e.payload as { name?: unknown; title?: unknown })) fileEdit++
            lastActivityAt = e.createdAt
          } else if (
            e.payload.kind === 'agent_message_chunk' ||
            e.payload.kind === 'agent_thought_chunk'
          ) {
            lastActivityAt = e.createdAt
          }
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
        // best-effort
      }

      const onEvent = (event: EventEnvelope) => {
        const payload = event.payload
        switch (payload.kind) {
          case 'tool_call':
            set((state) => {
              const current = state.statuses[sessionId]
              if (!current) return state
              return {
                statuses: {
                  ...state.statuses,
                  [sessionId]: {
                    ...current,
                    toolCalls: current.toolCalls + 1,
                    fileChanges:
                      current.fileChanges +
                      (isFileEditTool(payload as { name?: unknown; title?: unknown }) ? 1 : 0),
                    lastActivityAt: event.createdAt,
                  },
                },
              }
            })
            break

          case 'agent_message_chunk':
          case 'agent_thought_chunk':
            set((state) => {
              const current = state.statuses[sessionId]
              if (!current) return state
              return {
                statuses: {
                  ...state.statuses,
                  [sessionId]: {
                    ...current,
                    streaming: true,
                    lastActivityAt: event.createdAt,
                  },
                },
              }
            })
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
            break

          case 'permission_request': {
            const req = payload as unknown as PermissionRequestPayload
            const autoAccept = useSettingsStore.getState().autoAcceptPermissions
            if (autoAccept) {
              const preferred: PermissionOutcome[] = ['allow_always', 'allow_once', 'reject']
              const outcome = preferred.find((o) =>
                req.availableOutcomes?.includes(o),
              )
              if (outcome && outcome !== 'reject') {
                client.respondPermission(sessionId, req.requestId, outcome).catch(() => {
                  // wagent dedupes server-side; ignore.
                })
                return
              }
            }
            set((state) => {
              const current = state.statuses[sessionId]
              if (!current) return state
              return {
                statuses: {
                  ...state.statuses,
                  [sessionId]: {
                    ...current,
                    pendingPermission: true,
                    lastActivityAt: event.createdAt,
                  },
                },
              }
            })
            break
          }

          case 'permission_resolved':
            get().clearPendingPermission(sessionId)
            break

          case 'stop':
            set((state) => {
              const current = state.statuses[sessionId]
              if (!current) return state
              return {
                statuses: {
                  ...state.statuses,
                  [sessionId]: { ...current, streaming: false },
                },
              }
            })
            break

          default:
            break
        }
      }

      entry.unsubscribe = client.subscribeEvents(sessionId, onEvent)
    } catch {
      entries.delete(k)
    }
  },

  clearPendingPermission(sessionId) {
    set((state) => {
      const current = state.statuses[sessionId]
      if (!current || !current.pendingPermission) return state
      return {
        statuses: {
          ...state.statuses,
          [sessionId]: { ...current, pendingPermission: false },
        },
      }
    })
  },

  unwatch(hostId, sessionId) {
    const k = key(hostId, sessionId)
    const entry = entries.get(k)
    if (!entry) return
    entry.watchers -= 1
    if (entry.watchers > 0) return

    entry.unsubscribe()
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
