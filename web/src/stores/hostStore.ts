import { create } from 'zustand'
import { hostRepository } from '@/services/db'
import { disconnectHost } from '@/services/sandboxAgent/client'
import type { Host } from '@/types'

interface HostStoreState {
  hosts: Host[]
  selectedHostId: number | null
  isLoading: boolean
  error: string | null

  initialize(): Promise<void>
  refresh(): Promise<void>
  addHost(input: Omit<Host, 'id' | 'createdAt'>): Promise<Host>
  updateHost(id: number, updates: Partial<Host>): Promise<void>
  removeHost(id: number): Promise<void>
  selectHost(id: number | null): void
  touchLastConnected(id: number): Promise<void>
}

export const useHostStore = create<HostStoreState>()((set, get) => ({
  hosts: [],
  selectedHostId: null,
  isLoading: false,
  error: null,

  async initialize() {
    if (get().hosts.length > 0) return
    await get().refresh()
  },

  async refresh() {
    set({ isLoading: true, error: null })
    try {
      const hosts = await hostRepository.getAll()
      set({ hosts, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load hosts',
        isLoading: false,
      })
    }
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
}))
