/**
 * Settings store for managing app settings state.
 */

import { create } from 'zustand';
import { updateService, type UpdateInfo } from '@/services/updates/updateService';
import { debugLogManager, type DebugLogEntry } from '@/services/debug/debugLogManager';

interface SettingsState {
  // Version info
  currentVersionName: string;
  currentVersionCode: number;

  // Update state
  isCheckingForUpdate: boolean;
  isDownloadingUpdate: boolean;
  downloadProgress: number;
  updateAvailable: UpdateInfo | null;
  cachedApkPath: string | null;

  // Debug logs
  debugLogs: DebugLogEntry[];

  // Error state
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  clearLogs: () => void;
  dismissError: () => void;
}


export const useSettingsStore = create<SettingsState>()((set, get) => ({
  // Initial state
  currentVersionName: updateService.getCurrentVersionName(),
  currentVersionCode: updateService.getCurrentVersionCode(),
  isCheckingForUpdate: false,
  isDownloadingUpdate: false,
  downloadProgress: 0,
  updateAvailable: null,
  cachedApkPath: null,
  debugLogs: [],
  error: null,

  initialize: async () => {
    // Subscribe to debug logs
    debugLogManager.subscribe((logs) => {
      set({ debugLogs: logs });
    });
  },

  checkForUpdate: async () => {
    set({ isCheckingForUpdate: true, error: null });

    try {
      const updateInfo = await updateService.checkForUpdate();

      if (updateInfo) {
        set({
          isCheckingForUpdate: false,
          updateAvailable: updateInfo,
          isDownloadingUpdate: true,
          downloadProgress: 0,
        });

        // Start downloading
        try {
          const apkPath = await updateService.downloadUpdate(updateInfo, (progress) => {
            set({ downloadProgress: progress });
          });

          set({
            isDownloadingUpdate: false,
            downloadProgress: 1,
            cachedApkPath: apkPath,
          });
        } catch (downloadError) {
          set({
            isDownloadingUpdate: false,
            downloadProgress: 0,
            error: `Download failed: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`,
          });
        }
      } else {
        set({
          isCheckingForUpdate: false,
          updateAvailable: null,
          cachedApkPath: null,
        });
      }
    } catch (error) {
      set({
        isCheckingForUpdate: false,
        error: `Failed to check for updates: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  },

  installUpdate: async () => {
    const { cachedApkPath } = get();
    if (!cachedApkPath) {
      set({ error: 'No update available to install' });
      return;
    }

    try {
      await updateService.installUpdate(cachedApkPath);
    } catch (error) {
      set({
        error: `Failed to install update: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  },

  clearLogs: () => {
    debugLogManager.clear();
  },

  dismissError: () => {
    set({ error: null });
  },
}));
