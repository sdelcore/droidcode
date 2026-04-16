import { db } from './database'
import type { ProjectFolder } from '@/types'

export const projectRepository = {
  getByHost(hostId: number): Promise<ProjectFolder[]> {
    return db.projects.where('hostId').equals(hostId).reverse().sortBy('lastUsed')
  },

  getById(id: number): Promise<ProjectFolder | undefined> {
    return db.projects.get(id)
  },

  async upsert(
    input: Omit<ProjectFolder, 'id' | 'createdAt'> & { id?: number },
  ): Promise<ProjectFolder> {
    const existing = await db.projects
      .where({ hostId: input.hostId, directory: input.directory })
      .first()

    const now = Date.now()
    if (existing) {
      await db.projects.update(existing.id, {
        name: input.name,
        lastUsed: now,
      })
      return { ...existing, name: input.name, lastUsed: now }
    }

    const id = await db.projects.add({
      ...input,
      createdAt: now,
      lastUsed: now,
    } as ProjectFolder)
    return { ...input, id, createdAt: now, lastUsed: now }
  },

  async delete(id: number): Promise<void> {
    await db.projects.delete(id)
  },

  async deleteByHost(hostId: number): Promise<void> {
    await db.projects.where('hostId').equals(hostId).delete()
  },
}
