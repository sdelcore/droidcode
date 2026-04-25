import { get, set, del } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

export const idbStorage: StateStorage = {
  async getItem(name) {
    const value = await get<string | undefined>(name)
    return value ?? null
  },
  async setItem(name, value) {
    await set(name, value)
  },
  async removeItem(name) {
    await del(name)
  },
}
