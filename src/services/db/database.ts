import Dexie, { type EntityTable } from 'dexie'
import type { Host, ProjectFolder, SessionPreferences, HostModelDefault } from '@/types'

class DroidCodeDatabase extends Dexie {
  hosts!: EntityTable<Host, 'id'>
  projects!: EntityTable<ProjectFolder, 'id'>
  sessionPreferences!: EntityTable<SessionPreferences, 'sessionId'>
  hostModelDefaults!: EntityTable<HostModelDefault, 'hostId'>

  constructor() {
    super('droidcode')

    this.version(1).stores({
      hosts: '++id, host, port, createdAt',
      projects: '++id, hostId, directory, lastUsed',
      sessionPreferences: 'sessionId, hostId',
      hostModelDefaults: 'hostId',
    })
  }
}

export const db = new DroidCodeDatabase()
