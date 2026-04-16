import { db } from './database'
import type { SessionPreferences } from '@/types'

export const sessionPreferencesRepository = {
  get(sessionId: string): Promise<SessionPreferences | undefined> {
    return db.sessionPreferences.get(sessionId)
  },

  getByHost(hostId: number): Promise<SessionPreferences[]> {
    return db.sessionPreferences.where('hostId').equals(hostId).toArray()
  },

  async save(prefs: SessionPreferences): Promise<void> {
    await db.sessionPreferences.put(prefs)
  },

  async delete(sessionId: string): Promise<void> {
    await db.sessionPreferences.delete(sessionId)
  },

  async deleteByHost(hostId: number): Promise<void> {
    await db.sessionPreferences.where('hostId').equals(hostId).delete()
  },
}
