import { db } from './database'
import type { SessionPreferences } from '@/types'

export const sessionPreferencesRepository = {
  get(sessionId: string): Promise<SessionPreferences | undefined> {
    return db.sessionPreferences.get(sessionId)
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
