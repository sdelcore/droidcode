import { create } from 'zustand';
import type { Host } from '@/types';
import { hostRepository } from '@/services/db';

/**
 * Host store - manages server configurations.
 *
 * Uses SQLite for persistence via hostRepository.
 * The store acts as an in-memory cache with async sync to database.
 */

interface HostState {
  hosts: Host[];
  selectedHostId: number | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  addHost: (host: Omit<Host, 'id' | 'createdAt'>) => Promise<number>;
  updateHost: (id: number, updates: Partial<Omit<Host, 'id'>>) => Promise<void>;
  removeHost: (id: number) => Promise<void>;
  selectHost: (id: number | null) => void;
  updateLastConnected: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useHostStore = create<HostState>()((set, get) => ({
  hosts: [],
  selectedHostId: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    if (get().isInitialized) return;

    set({ isLoading: true, error: null });

    try {
      const hosts = await hostRepository.getAll();
      set({
        hosts,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load hosts';
      set({ error: message, isLoading: false });
    }
  },

  addHost: async (hostData) => {
    set({ isLoading: true, error: null });

    try {
      const id = await hostRepository.insert(hostData);
      const hosts = await hostRepository.getAll();
      set({ hosts, isLoading: false });
      return id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add host';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updateHost: async (id, updates) => {
    set({ isLoading: true, error: null });

    try {
      await hostRepository.update(id, updates);
      const hosts = await hostRepository.getAll();
      set({ hosts, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update host';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  removeHost: async (id) => {
    set({ isLoading: true, error: null });

    try {
      await hostRepository.delete(id);
      const hosts = await hostRepository.getAll();
      set((state) => ({
        hosts,
        selectedHostId: state.selectedHostId === id ? null : state.selectedHostId,
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove host';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  selectHost: (id) => {
    set({ selectedHostId: id });
  },

  updateLastConnected: async (id) => {
    try {
      await hostRepository.updateLastConnected(id);
      // Update local state
      set((state) => ({
        hosts: state.hosts.map((host) =>
          host.id === id ? { ...host, lastConnected: Date.now() } : host
        ),
      }));
    } catch (error) {
      console.error('Failed to update last connected:', error);
    }
  },

  refresh: async () => {
    set({ isLoading: true, error: null });

    try {
      const hosts = await hostRepository.getAll();
      set({ hosts, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh hosts';
      set({ error: message, isLoading: false });
    }
  },
}));
