import { create } from 'zustand'
import type { AgentDto, ProviderDto, ProviderStatusDto, ModelInfoDto } from '@/types'
import { apiClient } from '@/services/api/apiClient'
import { modelPreferencesRepository } from '@/services/db/repositories/modelPreferencesRepository'

interface ConfigState {
  // Agents
  agents: AgentDto[];
  isLoadingAgents: boolean;

  // Providers & Models
  providers: ProviderDto[];
  providerStatuses: ProviderStatusDto[];
  isLoadingProviders: boolean;

  // Selected model
  selectedProvider: string | null;
  selectedModel: string | null;

  // Current host context
  currentHostId: number | null;

  // Errors
  error: string | null;

  // Actions
  fetchAgents: (hostId: number, port?: number) => Promise<void>
  fetchProviders: (hostId: number, port?: number) => Promise<void>
  fetchProviderStatuses: (hostId: number, port?: number) => Promise<void>
  loadSavedDefault: (hostId: number) => Promise<void>
  loadSessionOverride: (hostId: number, sessionId: string) => Promise<void>
  setSelectedModel: (providerId: string, modelId: string, persist?: boolean) => void
  saveGlobalDefault: (hostId: number, providerId: string, modelId: string) => Promise<void>
  getSelectedModelDto: () => { providerID: string; modelID: string } | null
  clearConfig: () => void
}

export const useConfigStore = create<ConfigState>()((set, get) => ({
  agents: [],
  isLoadingAgents: false,
  providers: [],
  providerStatuses: [],
  isLoadingProviders: false,
  selectedProvider: null,
  selectedModel: null,
  currentHostId: null,
  error: null,

  fetchAgents: async (hostId: number, port?: number) => {
    set({ isLoadingAgents: true, error: null, currentHostId: hostId });

    try {
      const agents = await apiClient.getAgents(hostId, port);
      set({ agents, isLoadingAgents: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch agents';
      set({ error: message, isLoadingAgents: false });
    }
  },

  fetchProviders: async (hostId: number, port?: number) => {
    set({ isLoadingProviders: true, error: null })

    try {
      const response = await apiClient.getProviders(hostId, port)
      set({
        providers: response.providers,
        isLoadingProviders: false,
      })

      // Load saved default from DB first
      const savedPref = await modelPreferencesRepository.getGlobalDefault(hostId)
      
      if (savedPref) {
        // Use saved preference
        set({
          selectedProvider: savedPref.providerId,
          selectedModel: savedPref.modelId,
        })
      } else {
        // No saved preference - use server's default
        const { selectedProvider, selectedModel } = get()
        if (!selectedProvider && !selectedModel && response.default) {
          // default is Record<providerId, modelId> - pick first connected provider
          const defaultEntries = Object.entries(response.default)
          if (defaultEntries.length > 0) {
            const [providerId, modelId] = defaultEntries[0]
            // Set and save this as the default
            set({
              selectedProvider: providerId,
              selectedModel: modelId,
            })
            await modelPreferencesRepository.setGlobalDefault(hostId, providerId, modelId)
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch providers'
      set({ error: message, isLoadingProviders: false })
    }
  },

  fetchProviderStatuses: async (hostId: number, port?: number) => {
    try {
      const statuses = await apiClient.getProviderStatus(hostId, port);
      set({ providerStatuses: Array.isArray(statuses) ? statuses : [] });
    } catch (error) {
      console.error('Failed to fetch provider statuses:', error);
    }
  },

  loadSavedDefault: async (hostId: number) => {
    try {
      const savedPref = await modelPreferencesRepository.getGlobalDefault(hostId)
      if (savedPref) {
        set({
          selectedProvider: savedPref.providerId,
          selectedModel: savedPref.modelId,
        })
      }
    } catch (error) {
      console.error('Failed to load saved model preference:', error)
    }
  },

  loadSessionOverride: async (hostId: number, sessionId: string) => {
    try {
      const effectivePref = await modelPreferencesRepository.getEffectivePreference(hostId, sessionId)
      if (effectivePref) {
        set({
          selectedProvider: effectivePref.providerId,
          selectedModel: effectivePref.modelId,
        })
      }
    } catch (error) {
      console.error('Failed to load session model preference:', error)
    }
  },

  setSelectedModel: (providerId: string, modelId: string, persist = true) => {
    set({ selectedProvider: providerId, selectedModel: modelId })
    
    // Auto-persist global default if persist flag is true
    // (for Settings screen usage - we'll manually handle session overrides in chatStore)
    if (persist) {
      const { currentHostId } = get()
      if (currentHostId) {
        modelPreferencesRepository.setGlobalDefault(currentHostId, providerId, modelId).catch((error) => {
          console.error('Failed to save global model preference:', error)
        })
      }
    }
  },

  saveGlobalDefault: async (hostId: number, providerId: string, modelId: string) => {
    try {
      await modelPreferencesRepository.setGlobalDefault(hostId, providerId, modelId)
      set({
        selectedProvider: providerId,
        selectedModel: modelId,
        currentHostId: hostId,
      })
    } catch (error) {
      console.error('Failed to save global default:', error)
      throw error
    }
  },

  getSelectedModelDto: () => {
    const { selectedProvider, selectedModel } = get();
    if (selectedProvider && selectedModel) {
      return { providerID: selectedProvider, modelID: selectedModel };
    }
    return null;
  },

  clearConfig: () => {
    set({
      agents: [],
      providers: [],
      providerStatuses: [],
      selectedProvider: null,
      selectedModel: null,
      currentHostId: null,
      error: null,
    });
  },
}));
