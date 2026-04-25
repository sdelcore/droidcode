import { create } from 'zustand'
import { hostRepository } from '@/services/db'
import { disconnectHost, fetchBootstrapMeta } from '@/services/wagent'
import type { Host } from '@/types'

const SEED_FLAG_KEY = 'droidcode:default-host-seeded'
const DEFAULT_WAGENT_PORT = 2468

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
    let hosts = await hostRepository.getAll()
    if (hosts.length === 0 && !hasSeededFlag()) {
      const seeded = await seedDefaultHost()
      if (seeded) {
        markSeeded()
        hosts = await hostRepository.getAll()
      }
    }
    return { hosts, error: null }
  } catch (error) {
    return {
      hosts: [],
      error: error instanceof Error ? error.message : 'Failed to load hosts',
    }
  }
}

function hasSeededFlag(): boolean {
  try {
    return localStorage.getItem(SEED_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

function markSeeded(): void {
  try {
    localStorage.setItem(SEED_FLAG_KEY, '1')
  } catch {
    // private browsing / disabled storage — non-fatal
  }
}

// Try to learn the machine hostname from wagent's /v1/meta and seed a
// Host pointing at the local wagent. Falls back to "localhost" if
// unreachable so the first-run experience still works.
async function seedDefaultHost(): Promise<Host | null> {
  const meta = await fetchBootstrapMeta()
  const hostname = meta?.hostname ?? 'localhost'
  try {
    return await hostRepository.create({
      name: hostname,
      host: hostname,
      port: DEFAULT_WAGENT_PORT,
      isSecure: false,
    })
  } catch {
    return null
  }
}

export const useHostStore = create<HostStoreState>()((set, get) => {
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
      disconnectHost(id)
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
