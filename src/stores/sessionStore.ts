import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AgentKind, Session } from '@/services/wagent'
import { connectToHost } from '@/services/wagent'
import { destroySessionData } from '@/services/sessions/sessionRegistry'
import { requireHost, useHostStore, waitForHosts } from './hostStore'
import { idbStorage } from './idbStorage'
import {
  DEFAULT_SESSION_FILTERS,
  deserializeFilters,
  serializeFilters,
  type SerializedSessionFilters,
  type SessionFilters,
  type SortPreset,
} from '@/types'

export interface SessionCreateInput {
  agent: AgentKind
  cwd: string
  alias?: string | null
  model?: string | null
}

interface SessionStoreState {
  byHost: Record<number, Session[]>
  isLoading: boolean
  error: string | null
  filters: SessionFilters

  loadForHost(hostId: number): Promise<void>
  loadAllHosts(): Promise<void>
  createSession(hostId: number, input: SessionCreateInput): Promise<Session>
  destroySession(hostId: number, sessionId: string): Promise<void>
  patchSession(hostId: number, sessionId: string, patch: { alias?: string | null; model?: string | null }): Promise<Session>
  setFilters(next: Partial<SessionFilters>): void
  setSortPreset(preset: SortPreset): void
  clearFilters(): void
}

async function listForHost(hostId: number): Promise<Session[]> {
  const host = await requireHost(hostId)
  const client = connectToHost(host)
  return client.listSessions({ includeDestroyed: false })
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
          const items = await listForHost(hostId)
          set({ byHost: { ...get().byHost, [hostId]: items }, isLoading: false })
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
          hosts.map(async (h) => [h.id, await listForHost(h.id)] as const),
        )
        const next: Record<number, Session[]> = { ...get().byHost }
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

      async createSession(hostId, input) {
        const host = await requireHost(hostId)
        const client = connectToHost(host)
        const session = await client.createSession(input)
        const list = get().byHost[hostId] ?? []
        set({ byHost: { ...get().byHost, [hostId]: [session, ...list] } })
        return session
      },

      async destroySession(hostId, sessionId) {
        const host = await requireHost(hostId)
        const client = connectToHost(host)
        await client.deleteSession(sessionId)
        // Chat attachments are app-scoped (see ChatPane). Destroying the
        // session is the authoritative signal to tear one down.
        destroySessionData(sessionId)
        const list = get().byHost[hostId] ?? []
        set({
          byHost: {
            ...get().byHost,
            [hostId]: list.filter((s) => s.id !== sessionId),
          },
        })
      },

      async patchSession(hostId, sessionId, patch) {
        const host = await requireHost(hostId)
        const client = connectToHost(host)
        const updated = await client.patchSession(sessionId, patch)
        const list = get().byHost[hostId] ?? []
        set({
          byHost: {
            ...get().byHost,
            [hostId]: list.map((s) => (s.id === sessionId ? updated : s)),
          },
        })
        return updated
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
