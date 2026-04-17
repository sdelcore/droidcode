import { create } from 'zustand'
import { hostRepository } from '@/services/db'
import { disconnectHost } from '@/services/sandboxAgent/client'
import type { Host } from '@/types'

interface HostStoreState {
  hosts: Host[]
  selectedHostId: number | null
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  readyPromise: Promise<void>

  initialize(): Promise<void>
  refresh(): Promise<void>
  addHost(input: Omit<Host, 'id' | 'createdAt'>): Promise<Host>
  updateHost(id: number, updates: Partial<Host>): Promise<void>
  removeHost(id: number): Promise<void>
  selectHost(id: number | null): void
  touchLastConnected(id: number): Promise<void>
}

async function bootstrapHosts(): Promise<{ hosts: Host[]; error: string | null }> {
  try {
    const hosts = await hostRepository.getAll()
    return { hosts, error: null }
  } catch (error) {
    return {
      hosts: [],
      error: error instanceof Error ? error.message : 'Failed to load hosts',
    }
  }
}

export const useHostStore = create<HostStoreState>()((set, get) => {
  // Kick off Dexie load at module import so any page-level effect that
  // awaits readyPromise sees a populated `hosts` list, even on deep links.
  const readyPromise = bootstrapHosts().then((result) => {
    set({
      hosts: result.hosts,
      error: result.error,
      isLoading: false,
      isInitialized: true,
    })
  })

  return {
    hosts: [],
    selectedHostId: null,
    isLoading: true,
    isInitialized: false,
    error: null,
    readyPromise,

    async initialize() {
      return get().readyPromise
    },

    async refresh() {
      set({ isLoading: true, error: null })
      const result = await bootstrapHosts()
      set({
        hosts: result.hosts,
        error: result.error,
        isLoading: false,
        isInitialized: true,
      })
    },

    async addHost(input) {
      const host = await hostRepository.create(input)
      set({ hosts: [host, ...get().hosts] })
      return host
    },

    async updateHost(id, updates) {
      await hostRepository.update(id, updates)
      set({
        hosts: get().hosts.map((h) => (h.id === id ? { ...h, ...updates } : h)),
      })
    },

    async removeHost(id) {
      await disconnectHost(id)
      await hostRepository.delete(id)
      set((state) => ({
        hosts: state.hosts.filter((h) => h.id !== id),
        selectedHostId: state.selectedHostId === id ? null : state.selectedHostId,
      }))
    },

    selectHost(id) {
      set({ selectedHostId: id })
    },

    async touchLastConnected(id) {
      const now = Date.now()
      await hostRepository.touchLastConnected(id)
      set({
        hosts: get().hosts.map((h) =>
          h.id === id ? { ...h, lastConnected: now } : h,
        ),
      })
    },
  }
})

export async function waitForHosts(): Promise<void> {
  await useHostStore.getState().readyPromise
}

export function getHostById(hostId: number): Host | undefined {
  return useHostStore.getState().hosts.find((h) => h.id === hostId)
}

export async function requireHost(hostId: number): Promise<Host> {
  await waitForHosts()
  const host = getHostById(hostId)
  if (!host) throw new Error(`Host ${hostId} not found`)
  return host
}
