import { db } from './database'
import type { Host } from '@/types'

export const hostRepository = {
  getAll(): Promise<Host[]> {
    return db.hosts.orderBy('createdAt').reverse().toArray()
  },

  getById(id: number): Promise<Host | undefined> {
    return db.hosts.get(id)
  },

  async create(host: Omit<Host, 'id' | 'createdAt'>): Promise<Host> {
    const now = Date.now()
    const id = await db.hosts.add({ ...host, createdAt: now } as Host)
    return { ...host, id, createdAt: now }
  },

  async update(id: number, updates: Partial<Host>): Promise<void> {
    await db.hosts.update(id, updates)
  },

  async delete(id: number): Promise<void> {
    await db.hosts.delete(id)
  },

  async touchLastConnected(id: number): Promise<void> {
    await db.hosts.update(id, { lastConnected: Date.now() })
  },
}
