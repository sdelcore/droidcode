import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SessionCreateRequest, SessionRecord } from 'sandbox-agent'
import { connectToHost } from '@/services/sandboxAgent/client'
import { requireHost } from './hostStore'
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
  return page.items.map((s) => s.toRecord())
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

      async createSession(hostId, request) {
        const host = await requireHost(hostId)
        const sdk = await connectToHost(host)
        const session = await sdk.createSession(request)
        const record = session.toRecord()
        const list = get().byHost[hostId] ?? []
        set({
          byHost: { ...get().byHost, [hostId]: [record, ...list] },
        })
        return record
      },

      async destroySession(hostId, sessionId) {
        const host = await requireHost(hostId)
        const sdk = await connectToHost(host)
        await sdk.destroySession(sessionId)
        const list = get().byHost[hostId] ?? []
        set({
          byHost: {
            ...get().byHost,
            [hostId]: list.filter((s) => s.id !== sessionId),
          },
        })
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
