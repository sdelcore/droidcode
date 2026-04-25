import { create } from 'zustand'
import type { AgentAvailability } from '@/services/wagent'
import { connectToHost } from '@/services/wagent'
import { hostModelDefaultsRepository } from '@/services/db'
import { requireHost } from './hostStore'
import type { HostModelDefault } from '@/types'

interface ConfigStoreState {
  agentsByHost: Record<number, AgentAvailability[]>
  defaultsByHost: Record<number, HostModelDefault | null>
  isLoading: boolean
  error: string | null

  loadAgents(hostId: number, options?: { force?: boolean }): Promise<void>
  loadDefault(hostId: number): Promise<void>
  saveDefault(defaults: HostModelDefault): Promise<void>
  clearDefault(hostId: number): Promise<void>
}

export const useConfigStore = create<ConfigStoreState>()((set, get) => ({
  agentsByHost: {},
  defaultsByHost: {},
  isLoading: false,
  error: null,

  async loadAgents(hostId, options) {
    if (!options?.force && get().agentsByHost[hostId]) return
    set({ isLoading: true, error: null })
    try {
      const host = await requireHost(hostId)
      const client = connectToHost(host)
      const agents = await client.listAgents()
      set({
        agentsByHost: { ...get().agentsByHost, [hostId]: agents },
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load agents',
        isLoading: false,
      })
    }
  },

  async loadDefault(hostId) {
    const defaults = await hostModelDefaultsRepository.get(hostId)
    set({
      defaultsByHost: { ...get().defaultsByHost, [hostId]: defaults ?? null },
    })
  },

  async saveDefault(defaults) {
    await hostModelDefaultsRepository.set(defaults)
    set({
      defaultsByHost: { ...get().defaultsByHost, [defaults.hostId]: defaults },
    })
  },

  async clearDefault(hostId) {
    await hostModelDefaultsRepository.delete(hostId)
    set({
      defaultsByHost: { ...get().defaultsByHost, [hostId]: null },
    })
  },
}))
