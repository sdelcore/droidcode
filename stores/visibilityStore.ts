/**
 * Visibility store for tracking active session and app state.
 * Used to suppress notifications when user is viewing the session.
 * Ported from: service/SessionVisibilityTracker.kt
 */

import { create } from 'zustand';

interface VisibilityState {
  // Currently viewed session
  activeSessionId: string | null;
  activeHostId: number | null;

  // App foreground/background state
  isAppInForeground: boolean;

  // Actions
  setActiveSession: (sessionId: string | null, hostId: number | null) => void;
  setAppForeground: (inForeground: boolean) => void;
  clearActiveSession: () => void;

  // Helpers
  shouldNotify: (sessionId: string) => boolean;
  isViewingSession: (sessionId: string) => boolean;
}

export const useVisibilityStore = create<VisibilityState>()((set, get) => ({
  activeSessionId: null,
  activeHostId: null,
  isAppInForeground: true,

  setActiveSession: (sessionId, hostId) => {
    set({ activeSessionId: sessionId, activeHostId: hostId });
  },

  setAppForeground: (inForeground) => {
    set({ isAppInForeground: inForeground });
  },

  clearActiveSession: () => {
    set({ activeSessionId: null, activeHostId: null });
  },

  shouldNotify: (sessionId) => {
    const { activeSessionId, isAppInForeground } = get();

    // Don't notify if:
    // 1. User is viewing this specific session AND app is in foreground
    if (isAppInForeground && activeSessionId === sessionId) {
      return false;
    }

    // Otherwise, show notification
    return true;
  },

  isViewingSession: (sessionId) => {
    const { activeSessionId, isAppInForeground } = get();
    return isAppInForeground && activeSessionId === sessionId;
  },
}));
