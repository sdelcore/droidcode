import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SessionCreateRequest, SessionRecord } from 'sandbox-agent'
import { connectToHost } from '@/services/sandboxAgent/client'
import { requireHost, useHostStore, waitForHosts } from './hostStore'
import { useChatStore } from './chatStore'
import { useMetadataStore } from './metadataStore'
import { idbStorage } from './idbStorage'
import {
  DEFAULT_SESSION_FILTERS,
  deserializeFilters,
  serializeFilters,
  type SerializedSessionFilters,
  type SessionFilters,
  type SortPreset,
} from '@/types'

interface SessionStoreState {
  byHost: Record<number, SessionRecord[]>
  isLoading: boolean
  error: string | null
  filters: SessionFilters

  loadForHost(hostId: number): Promise<void>
  loadAllHosts(): Promise<void>
  createSession(hostId: number, request: SessionCreateRequest): Promise<SessionRecord>
  destroySession(hostId: number, sessionId: string): Promise<void>
  setFilters(next: Partial<SessionFilters>): void
  setSortPreset(preset: SortPreset): void
  clearFilters(): void
}

async function listRecordsForHost(hostId: number): Promise<SessionRecord[]> {
  const host = await requireHost(hostId)
  const sdk = await connectToHost(host)
  const page = await sdk.listSessions({ limit: 200 })
  // The SDK's persist driver keeps destroyed sessions (destroyedAt set)
  // indefinitely and doesn't expose a delete primitive. Filter them out
  // client-side so the dashboard matches user expectations after deletes.
  return page.items
    .map((s) => s.toRecord())
    .filter((r) => !r.destroyedAt)
}

export const useSessionStore = create<SessionStoreState>()(
  persist(
    (set, get) => ({
      byHost: {},
      isLoading: false,
      error: null,
      filters: DEFAULT_SESSION_FILTERS,

      async loadForHost(hostId) {
        set({ isLoading: true, error: null })
        try {
          const items = await listRecordsForHost(hostId)
          set({
            byHost: { ...get().byHost, [hostId]: items },
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load sessions',
            isLoading: false,
          })
        }
      },

      async loadAllHosts() {
        set({ isLoading: true, error: null })
        await waitForHosts()
        const hosts = useHostStore.getState().hosts
        const entries = await Promise.allSettled(
          hosts.map(async (h) => [h.id, await listRecordsForHost(h.id)] as const),
        )
        const next: Record<number, SessionRecord[]> = { ...get().byHost }
        const failures: string[] = []
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]
          const host = hosts[i]
          if (entry.status === 'fulfilled') {
            next[entry.value[0]] = entry.value[1]
          } else {
            const msg = entry.reason instanceof Error ? entry.reason.message : 'load failed'
            failures.push(`${host.name}: ${msg}`)
          }
        }
        set({
          byHost: next,
          isLoading: false,
          error: failures.length > 0 ? failures.join('; ') : null,
        })
      },

      async createSession(hostId, request) {
        const host = await requireHost(hostId)
        const sdk = await connectToHost(host)
        const session = await sdk.createSession(request)
        const record = session.toRecord()
        const list = get().byHost[hostId] ?? []
        set({
          byHost: { ...get().byHost, [hostId]: [record, ...list] },
        })
        // Snapshot this session into the daemon-side metadata file so other
        // browsers/devices pointed at the same daemon can resume it without
        // having watched its creation.
        useMetadataStore.getState().upsertSession(hostId, {
          id: record.id,
          agent: record.agent,
          agentSessionId: record.agentSessionId,
          lastConnectionId: record.lastConnectionId,
          sessionInit: record.sessionInit,
          createdAt: record.createdAt,
        })
        return record
      },

      async destroySession(hostId, sessionId) {
        const host = await requireHost(hostId)
        const sdk = await connectToHost(host)
        await sdk.destroySession(sessionId)
        // Chat attachments are app-scoped (see ChatPane). Destroying the
        // session is the authoritative signal to tear one down; otherwise
        // the SSE subscription and event mirror would leak.
        useChatStore.getState().closeSession(sessionId)
        const list = get().byHost[hostId] ?? []
        set({
          byHost: {
            ...get().byHost,
            [hostId]: list.filter((s) => s.id !== sessionId),
          },
        })
        useMetadataStore.getState().removeSession(hostId, sessionId)
      },

      setFilters(next) {
        set({ filters: { ...get().filters, ...next } })
      },

      setSortPreset(preset) {
        set({ filters: { ...get().filters, sortPreset: preset } })
      },

      clearFilters() {
        set({ filters: DEFAULT_SESSION_FILTERS })
      },
    }),
    {
      name: 'droidcode:sessions',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({ filters: serializeFilters(state.filters) }),
      merge: (persisted, current) => {
        const p = persisted as { filters?: SerializedSessionFilters } | undefined
        return {
          ...current,
          filters: p?.filters ? deserializeFilters(p.filters) : current.filters,
        }
      },
    },
  ),
)
