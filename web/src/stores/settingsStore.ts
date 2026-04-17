import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from './idbStorage'

export type ThemePreference = 'system' | 'light' | 'dark'

interface DebugLogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error'
  message: string
}

interface SettingsStoreState {
  theme: ThemePreference
  autoAcceptPermissions: boolean
  debugLogs: DebugLogEntry[]

  setTheme(theme: ThemePreference): void
  setAutoAcceptPermissions(enabled: boolean): void
  log(level: DebugLogEntry['level'], message: string): void
  clearLogs(): void
}

const MAX_LOGS = 200

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      autoAcceptPermissions: true,
      debugLogs: [],

      setTheme(theme) {
        set({ theme })
      },

      setAutoAcceptPermissions(enabled) {
        set({ autoAcceptPermissions: enabled })
      },

      log(level, message) {
        const next = [...get().debugLogs, { timestamp: Date.now(), level, message }]
        if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS)
        set({ debugLogs: next })
      },

      clearLogs() {
        set({ debugLogs: [] })
      },
    }),
    {
      name: 'droidcode:settings',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        theme: state.theme,
        autoAcceptPermissions: state.autoAcceptPermissions,
      }),
    },
  ),
)
