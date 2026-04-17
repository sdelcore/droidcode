import { create } from 'zustand'
import type { Host } from '@/types'
import { metadataPath, readRemoteJson, writeRemoteJson } from '@/services/sync/remoteFs'
import { useHostStore } from './hostStore'

export interface RemoteSessionMeta {
  id: string
  agent?: string
  alias?: string
  // Captured at create time so other clients can seed their SDK persist
  // driver and call resumeSession without first having the record.
  agentSessionId?: string
  lastConnectionId?: string
  sessionInit?: unknown
  createdAt?: number
  destroyedAt?: number
}

export interface RemoteProjectMeta {
  directory: string
  name: string
}

export interface RemoteMetadata {
  schemaVersion: 1
  sessions: Record<string, RemoteSessionMeta>
  projects: RemoteProjectMeta[]
}

interface HostBucket {
  loading: boolean
  loaded: boolean
  data: RemoteMetadata
  error: string | null
}

interface MetadataStoreState {
  byHost: Record<number, HostBucket>

  loadForHost(hostId: number): Promise<RemoteMetadata | null>
  upsertSession(hostId: number, session: RemoteSessionMeta): void
  removeSession(hostId: number, sessionId: string): void
  upsertProject(hostId: number, project: RemoteProjectMeta): void
  removeProject(hostId: number, directory: string): void
}

const WRITE_DEBOUNCE_MS = 800

// Per-host pending-write timers + in-flight write promises so concurrent
// mutations coalesce into one PUT.
const pendingWrites = new Map<number, ReturnType<typeof setTimeout>>()
const inflightWrites = new Map<number, Promise<void>>()

function emptyMetadata(): RemoteMetadata {
  return { schemaVersion: 1, sessions: {}, projects: [] }
}

function emptyBucket(): HostBucket {
  return {
    loading: false,
    loaded: false,
    data: emptyMetadata(),
    error: null,
  }
}

function getHost(hostId: number): Host | undefined {
  return useHostStore.getState().hosts.find((h) => h.id === hostId)
}

async function performWrite(hostId: number, data: RemoteMetadata): Promise<void> {
  const host = getHost(hostId)
  if (!host) return
  const path = await metadataPath(host)
  await writeRemoteJson(host, path, data)
}

function scheduleWrite(get: () => MetadataStoreState, hostId: number): void {
  const existing = pendingWrites.get(hostId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    pendingWrites.delete(hostId)
    const bucket = get().byHost[hostId]
    if (!bucket) return
    const data = bucket.data
    const p = performWrite(hostId, data).catch((err) => {
      console.error('metadata write failed', err)
    })
    inflightWrites.set(hostId, p)
    p.finally(() => {
      if (inflightWrites.get(hostId) === p) inflightWrites.delete(hostId)
    })
  }, WRITE_DEBOUNCE_MS)
  pendingWrites.set(hostId, timer)
}

export const useMetadataStore = create<MetadataStoreState>()((set, get) => ({
  byHost: {},

  async loadForHost(hostId) {
    const bucket = get().byHost[hostId]
    if (bucket?.loaded || bucket?.loading) {
      return bucket.data
    }
    const next: HostBucket = { ...emptyBucket(), loading: true }
    set((state) => ({ byHost: { ...state.byHost, [hostId]: next } }))

    const host = getHost(hostId)
    if (!host) {
      set((state) => ({
        byHost: {
          ...state.byHost,
          [hostId]: { ...next, loading: false, error: 'host not found' },
        },
      }))
      return null
    }

    try {
      const path = await metadataPath(host)
      const remote = await readRemoteJson<RemoteMetadata>(host, path)
      const data: RemoteMetadata = remote && remote.schemaVersion === 1
        ? {
            schemaVersion: 1,
            sessions: remote.sessions ?? {},
            projects: remote.projects ?? [],
          }
        : emptyMetadata()
      set((state) => ({
        byHost: {
          ...state.byHost,
          [hostId]: { loading: false, loaded: true, data, error: null },
        },
      }))
      return data
    } catch (error) {
      const message = error instanceof Error ? error.message : 'metadata load failed'
      set((state) => ({
        byHost: {
          ...state.byHost,
          [hostId]: { ...next, loading: false, loaded: true, error: message },
        },
      }))
      return null
    }
  },

  upsertSession(hostId, session) {
    const bucket = get().byHost[hostId] ?? emptyBucket()
    const next = {
      ...bucket,
      data: {
        ...bucket.data,
        sessions: { ...bucket.data.sessions, [session.id]: { ...bucket.data.sessions[session.id], ...session } },
      },
    }
    set((state) => ({ byHost: { ...state.byHost, [hostId]: next } }))
    scheduleWrite(get, hostId)
  },

  removeSession(hostId, sessionId) {
    const bucket = get().byHost[hostId]
    if (!bucket) return
    if (!(sessionId in bucket.data.sessions)) return
    const { [sessionId]: _removed, ...rest } = bucket.data.sessions
    void _removed
    const next = {
      ...bucket,
      data: { ...bucket.data, sessions: rest },
    }
    set((state) => ({ byHost: { ...state.byHost, [hostId]: next } }))
    scheduleWrite(get, hostId)
  },

  upsertProject(hostId, project) {
    const bucket = get().byHost[hostId] ?? emptyBucket()
    const filtered = bucket.data.projects.filter((p) => p.directory !== project.directory)
    const next = {
      ...bucket,
      data: { ...bucket.data, projects: [...filtered, project] },
    }
    set((state) => ({ byHost: { ...state.byHost, [hostId]: next } }))
    scheduleWrite(get, hostId)
  },

  removeProject(hostId, directory) {
    const bucket = get().byHost[hostId]
    if (!bucket) return
    const filtered = bucket.data.projects.filter((p) => p.directory !== directory)
    if (filtered.length === bucket.data.projects.length) return
    const next = {
      ...bucket,
      data: { ...bucket.data, projects: filtered },
    }
    set((state) => ({ byHost: { ...state.byHost, [hostId]: next } }))
    scheduleWrite(get, hostId)
  },
}))

export async function flushPendingWrites(): Promise<void> {
  const timers = Array.from(pendingWrites.entries())
  for (const [hostId, timer] of timers) {
    clearTimeout(timer)
    pendingWrites.delete(hostId)
    const bucket = useMetadataStore.getState().byHost[hostId]
    if (bucket) {
      inflightWrites.set(hostId, performWrite(hostId, bucket.data))
    }
  }
  await Promise.allSettled([...inflightWrites.values()])
}
