import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from './idbStorage'

export interface LastChatPick {
  hostId: number
  sessionId: string
  extra?: string
}

interface LastPinnedChatState {
  last: LastChatPick | null
  setLast(pick: LastChatPick | null): void
}

export const useLastPinnedChatStore = create<LastPinnedChatState>()(
  persist(
    (set) => ({
      last: null,
      setLast(pick) {
        set({ last: pick })
      },
    }),
    {
      name: 'droidcode:last-chat',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
)
