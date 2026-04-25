import { create } from 'zustand'
import type { Host } from '@/types'
import {
  deleteProject as companionDeleteProject,
  deleteSession as companionDeleteSession,
  listProjects as companionListProjects,
  listSessions as companionListSessions,
  upsertProject as companionUpsertProject,
  upsertSession as companionUpsertSession,
  type CompanionProject,
  type CompanionSession,
} from '@/services/sync/companion'
import { useHostStore } from './hostStore'

export interface RemoteSessionMeta {
  id: string
  agent?: string
  alias?: string
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

interface HostBucket {
  loading: boolean
  loaded: boolean
  sessions: Record<string, RemoteSessionMeta>
  projects: RemoteProjectMeta[]
  error: string | null
  // Companion unreachable — app still works in local-only mode.
  offline: boolean
}

interface MetadataStoreState {
  byHost: Record<number, HostBucket>

  loadForHost(hostId: number): Promise<HostBucket | null>
  upsertSession(hostId: number, session: RemoteSessionMeta): void
  removeSession(hostId: number, sessionId: string): void
  upsertProject(hostId: number, project: RemoteProjectMeta): void
  removeProject(hostId: number, directory: string): void
}

const pendingUpserts = new Map<string, ReturnType<typeof setTimeout>>()

function emptyBucket(): HostBucket {
  return { loading: false, loaded: false, sessions: {}, projects: [], error: null, offline: false }
}

function getHost(hostId: number): Host | undefined {
  return useHostStore.getState().hosts.find((h) => h.id === hostId)
}

function sessionFromCompanion(s: CompanionSession): RemoteSessionMeta {
  return {
    id: s.id,
    agent: s.agent ?? undefined,
    alias: s.alias ?? undefined,
    agentSessionId: s.agentSessionId ?? undefined,
    lastConnectionId: s.lastConnectionId ?? undefined,
    sessionInit: s.sessionInit ?? undefined,
    createdAt: s.createdAt ?? undefined,
    destroyedAt: s.destroyedAt ?? undefined,
  }
}

function sessionToCompanion(meta: RemoteSessionMeta): CompanionSession {
  return {
    id: meta.id,
    agent: meta.agent ?? null,
    agentSessionId: meta.agentSessionId ?? null,
    lastConnectionId: meta.lastConnectionId ?? null,
    alias: meta.alias ?? null,
    sessionInit: meta.sessionInit ?? null,
    createdAt: meta.createdAt ?? null,
    destroyedAt: meta.destroyedAt ?? null,
  }
}

function projectFromCompanion(p: CompanionProject): RemoteProjectMeta {
  return { directory: p.directory, name: p.name }
}

// 400ms debounce per (hostId, sessionId) so a rename + small follow-up
// doesn't fire two PUTs. Simpler than the old full-blob debounce.
function queueSessionWrite(
  hostId: number,
  session: RemoteSessionMeta,
): void {
  const key = `${hostId}:s:${session.id}`
  const existing = pendingUpserts.get(key)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(async () => {
    pendingUpserts.delete(key)
    const host = getHost(hostId)
    if (!host) return
    try {
      const latest = useMetadataStore.getState().byHost[hostId]?.sessions[session.id] ?? session
      await companionUpsertSession(host, sessionToCompanion(latest))
      markOffline(hostId, false)
    } catch (err) {
      console.error('companion upsertSession failed', err)
      markOffline(hostId, true)
    }
  }, 400)
  pendingUpserts.set(key, timer)
}

function queueProjectWrite(hostId: number, project: RemoteProjectMeta): void {
  const key = `${hostId}:p:${project.directory}`
  const existing = pendingUpserts.get(key)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(async () => {
    pendingUpserts.delete(key)
    const host = getHost(hostId)
    if (!host) return
    try {
      await companionUpsertProject(host, project)
      markOffline(hostId, false)
    } catch (err) {
      console.error('companion upsertProject failed', err)
      markOffline(hostId, true)
    }
  }, 400)
  pendingUpserts.set(key, timer)
}

function markOffline(hostId: number, offline: boolean): void {
  useMetadataStore.setState((state) => {
    const bucket = state.byHost[hostId]
    if (!bucket || bucket.offline === offline) return state
    return { byHost: { ...state.byHost, [hostId]: { ...bucket, offline } } }
  })
}

export const useMetadataStore = create<MetadataStoreState>()((set, get) => ({
  byHost: {},

  async loadForHost(hostId) {
    const existing = get().byHost[hostId]
    if (existing?.loaded || existing?.loading) return existing

    const host = getHost(hostId)
    if (!host) return null

    set((state) => ({
      byHost: { ...state.byHost, [hostId]: { ...emptyBucket(), loading: true } },
    }))

    try {
      const [sessions, projects] = await Promise.all([
        companionListSessions(host),
        companionListProjects(host),
      ])
      const byId: Record<string, RemoteSessionMeta> = {}
      for (const s of sessions) byId[s.id] = sessionFromCompanion(s)
      const bucket: HostBucket = {
        loading: false,
        loaded: true,
        sessions: byId,
        projects: projects.map(projectFromCompanion),
        error: null,
        offline: false,
      }
      set((state) => ({ byHost: { ...state.byHost, [hostId]: bucket } }))
      return bucket
    } catch (error) {
      const bucket: HostBucket = {
        loading: false,
        loaded: true,
        sessions: {},
        projects: [],
        error: error instanceof Error ? error.message : 'companion load failed',
        offline: true,
      }
      set((state) => ({ byHost: { ...state.byHost, [hostId]: bucket } }))
      return bucket
    }
  },

  upsertSession(hostId, session) {
    const bucket = get().byHost[hostId] ?? emptyBucket()
    const merged: RemoteSessionMeta = { ...bucket.sessions[session.id], ...session }
    const next: HostBucket = {
      ...bucket,
      sessions: { ...bucket.sessions, [session.id]: merged },
    }
    set((state) => ({ byHost: { ...state.byHost, [hostId]: next } }))
    queueSessionWrite(hostId, merged)
  },

  removeSession(hostId, sessionId) {
    const bucket = get().byHost[hostId]
    if (!bucket || !(sessionId in bucket.sessions)) return
    const { [sessionId]: _removed, ...rest } = bucket.sessions
    void _removed
    set((state) => ({
      byHost: { ...state.byHost, [hostId]: { ...bucket, sessions: rest } },
    }))
    const host = getHost(hostId)
    if (!host) return
    companionDeleteSession(host, sessionId).catch((err) => {
      console.error('companion deleteSession failed', err)
      markOffline(hostId, true)
    })
  },

  upsertProject(hostId, project) {
    const bucket = get().byHost[hostId] ?? emptyBucket()
    const filtered = bucket.projects.filter((p) => p.directory !== project.directory)
    const next: HostBucket = { ...bucket, projects: [...filtered, project] }
    set((state) => ({ byHost: { ...state.byHost, [hostId]: next } }))
    queueProjectWrite(hostId, project)
  },

  removeProject(hostId, directory) {
    const bucket = get().byHost[hostId]
    if (!bucket) return
    const filtered = bucket.projects.filter((p) => p.directory !== directory)
    if (filtered.length === bucket.projects.length) return
    set((state) => ({
      byHost: { ...state.byHost, [hostId]: { ...bucket, projects: filtered } },
    }))
    const host = getHost(hostId)
    if (!host) return
    companionDeleteProject(host, directory).catch((err) => {
      console.error('companion deleteProject failed', err)
      markOffline(hostId, true)
    })
  },
}))
