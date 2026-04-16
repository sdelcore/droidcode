import { create } from 'zustand'

interface VisibilityStoreState {
  activeHostId: number | null
  activeSessionId: string | null
  isAppInForeground: boolean

  setActiveSession(hostId: number | null, sessionId: string | null): void
  clearActiveSession(): void
  setForeground(isForeground: boolean): void
  isViewingSession(hostId: number, sessionId: string): boolean
  shouldNotify(hostId: number, sessionId: string): boolean
}

export const useVisibilityStore = create<VisibilityStoreState>()((set, get) => ({
  activeHostId: null,
  activeSessionId: null,
  isAppInForeground: typeof document === 'undefined' || !document.hidden,

  setActiveSession(hostId, sessionId) {
    set({ activeHostId: hostId, activeSessionId: sessionId })
  },

  clearActiveSession() {
    set({ activeHostId: null, activeSessionId: null })
  },

  setForeground(isForeground) {
    set({ isAppInForeground: isForeground })
  },

  isViewingSession(hostId, sessionId) {
    const state = get()
    return (
      state.isAppInForeground &&
      state.activeHostId === hostId &&
      state.activeSessionId === sessionId
    )
  },

  shouldNotify(hostId, sessionId) {
    return !get().isViewingSession(hostId, sessionId)
  },
}))

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    useVisibilityStore.getState().setForeground(!document.hidden)
  })
}
