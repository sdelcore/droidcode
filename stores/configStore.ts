import { create } from 'zustand';
import type { AgentDto, ProviderDto, ProviderStatusDto, ModelInfoDto } from '@/types';
import { apiClient } from '@/services/api/apiClient';

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
  fetchAgents: (hostId: number, port?: number) => Promise<void>;
  fetchProviders: (hostId: number, port?: number) => Promise<void>;
  fetchProviderStatuses: (hostId: number, port?: number) => Promise<void>;
  setSelectedModel: (providerId: string, modelId: string) => void;
  getSelectedModelDto: () => { providerID: string; modelID: string } | null;
  clearConfig: () => void;
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
    set({ isLoadingProviders: true, error: null });

    try {
      const response = await apiClient.getProviders(hostId, port);
      set({
        providers: response.providers,
        isLoadingProviders: false,
      });

      // Set default model if not already selected
      const { selectedProvider, selectedModel } = get();
      if (!selectedProvider && !selectedModel && response.default) {
        // default is Record<providerId, modelId> - pick first connected provider
        const defaultEntries = Object.entries(response.default);
        if (defaultEntries.length > 0) {
          const [providerId, modelId] = defaultEntries[0];
          set({
            selectedProvider: providerId,
            selectedModel: modelId,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch providers';
      set({ error: message, isLoadingProviders: false });
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

  setSelectedModel: (providerId: string, modelId: string) => {
    set({ selectedProvider: providerId, selectedModel: modelId });
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
