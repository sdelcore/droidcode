import { db } from './database'
import type { HostModelDefault } from '@/types'

export const hostModelDefaultsRepository = {
  get(hostId: number): Promise<HostModelDefault | undefined> {
    return db.hostModelDefaults.get(hostId)
  },

  async set(defaults: HostModelDefault): Promise<void> {
    await db.hostModelDefaults.put(defaults)
  },

  async delete(hostId: number): Promise<void> {
    await db.hostModelDefaults.delete(hostId)
  },
}
