import type { Host } from '@/types'
import {
  WagentError,
  type AgentAvailability,
  type AgentKind,
  type ContentBlock,
  type EventEnvelope,
  type FsEntry,
  type PermissionOutcome,
  type Project,
  type Session,
  type WagentMeta,
} from './types'
import { subscribeEvents } from './sse'

export function wagentBaseUrl(host: Pick<Host, 'host' | 'port' | 'isSecure'>): string {
  return `${host.isSecure ? 'https' : 'http'}://${host.host}:${host.port}`
}

function authHeaders(host: Host): Record<string, string> {
  return host.token ? { authorization: `Bearer ${host.token}` } : {}
}

interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

async function request<T>(host: Host, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${wagentBaseUrl(host)}${path}`
  // Only attach content-type when there's a body — Fastify's JSON parser
  // rejects requests that advertise application/json with an empty body
  // (DELETE / abort / etc.) with a 400.
  const headers: Record<string, string> = { ...authHeaders(host) }
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers,
    signal: opts.signal,
  }
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body)

  const res = await fetch(url, init)
  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!res.ok) {
    let code = 'http_error'
    let message = `${res.status} ${res.statusText}`
    let details: unknown
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string; message?: string; details?: unknown } }
      if (parsed.error?.code) code = parsed.error.code
      if (parsed.error?.message) message = parsed.error.message
      details = parsed.error?.details
    } catch {
      // body wasn't JSON
      if (text) message = text
    }
    throw new WagentError(res.status, code, message, details)
  }

  if (!text) return undefined as T
  return JSON.parse(text) as T
}

// ----------------------------------------------------------------------------
// Public surface
// ----------------------------------------------------------------------------

export interface WagentClient {
  readonly host: Host
  readonly baseUrl: string

  health(): Promise<boolean>
  getMeta(): Promise<WagentMeta>
  listAgents(): Promise<AgentAvailability[]>

  listSessions(opts?: { includeDestroyed?: boolean }): Promise<Session[]>
  createSession(input: {
    agent: AgentKind
    cwd: string
    alias?: string | null
    model?: string | null
  }): Promise<Session>
  getSession(id: string): Promise<Session>
  patchSession(id: string, patch: { alias?: string | null; model?: string | null }): Promise<Session>
  deleteSession(id: string): Promise<void>

  listEvents(sessionId: string, opts?: { after?: number; limit?: number }): Promise<EventEnvelope[]>
  subscribeEvents(
    sessionId: string,
    listener: (event: EventEnvelope) => void,
    opts?: { lastEventId?: number; onError?: (err: Event | Error) => void },
  ): () => void

  sendMessage(sessionId: string, content: ContentBlock[]): Promise<void>
  abort(sessionId: string): Promise<void>
  respondPermission(
    sessionId: string,
    requestId: string,
    outcome: PermissionOutcome,
  ): Promise<void>

  listProjects(): Promise<Project[]>
  upsertProject(input: { directory: string; name?: string }): Promise<Project>
  deleteProject(directory: string): Promise<void>

  listFsEntries(path: string): Promise<FsEntry[]>
}

export function createWagentClient(host: Host): WagentClient {
  const baseUrl = wagentBaseUrl(host)
  return {
    host,
    baseUrl,

    async health() {
      try {
        const res = await fetch(`${baseUrl}/v1/health`, { headers: authHeaders(host) })
        return res.ok
      } catch {
        return false
      }
    },

    getMeta: () => request<WagentMeta>(host, '/v1/meta'),

    listAgents: async () => {
      const res = await request<{ agents: AgentAvailability[] }>(host, '/v1/agents')
      return res.agents ?? []
    },

    listSessions: async (opts = {}) => {
      const qs = opts.includeDestroyed ? '?destroyed=true' : ''
      const res = await request<{ sessions: Session[] }>(host, `/v1/sessions${qs}`)
      return res.sessions ?? []
    },

    createSession: (input) =>
      request<Session>(host, '/v1/sessions', { method: 'POST', body: input }),

    getSession: (id) => request<Session>(host, `/v1/sessions/${encodeURIComponent(id)}`),

    patchSession: (id, patch) =>
      request<Session>(host, `/v1/sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: patch,
      }),

    deleteSession: async (id) => {
      await request<void>(host, `/v1/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    listEvents: async (sessionId, opts = {}) => {
      const params = new URLSearchParams()
      if (opts.after !== undefined) params.set('after', String(opts.after))
      if (opts.limit !== undefined) params.set('limit', String(opts.limit))
      const qs = params.toString()
      const res = await request<{ events: EventEnvelope[] }>(
        host,
        `/v1/sessions/${encodeURIComponent(sessionId)}/events${qs ? `?${qs}` : ''}`,
      )
      return res.events ?? []
    },

    subscribeEvents: (sessionId, listener, opts = {}) =>
      subscribeEvents(host, sessionId, listener, opts),

    sendMessage: async (sessionId, content) => {
      await request<void>(host, `/v1/sessions/${encodeURIComponent(sessionId)}/message`, {
        method: 'POST',
        body: { content },
      })
    },

    abort: async (sessionId) => {
      await request<void>(host, `/v1/sessions/${encodeURIComponent(sessionId)}/abort`, {
        method: 'POST',
      })
    },

    respondPermission: async (sessionId, requestId, outcome) => {
      await request<void>(
        host,
        `/v1/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}`,
        { method: 'POST', body: { outcome } },
      )
    },

    listProjects: async () => {
      const res = await request<{ projects: Project[] }>(host, '/v1/projects')
      return res.projects ?? []
    },

    upsertProject: (input) =>
      request<Project>(host, '/v1/projects', { method: 'POST', body: input }),

    deleteProject: async (directory) => {
      await request<void>(
        host,
        `/v1/projects?directory=${encodeURIComponent(directory)}`,
        { method: 'DELETE' },
      )
    },

    listFsEntries: async (path) => {
      return request<FsEntry[]>(
        host,
        `/v1/fs/entries?path=${encodeURIComponent(path)}`,
      )
    },
  }
}

// Cached client per host id — keep one connection's worth of state alive
// across the app, similar to the old connectToHost pattern but now a
// thin HTTP client.
const byHostId = new Map<number, WagentClient>()

export function connectToHost(host: Host): WagentClient {
  const existing = byHostId.get(host.id)
  if (existing) return existing
  const client = createWagentClient(host)
  byHostId.set(host.id, client)
  return client
}

export function disconnectHost(hostId: number): void {
  byHostId.delete(hostId)
}

export function disconnectAll(): void {
  byHostId.clear()
}

export async function fetchHealth(host: Host | { baseUrl: string }): Promise<boolean> {
  const base = 'baseUrl' in host ? host.baseUrl : wagentBaseUrl(host)
  try {
    const res = await fetch(`${base}/v1/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

// Bootstrap helper used on first run to read /v1/meta from a default
// candidate URL when no Host has been configured yet.
export type BootstrapMeta = WagentMeta

export async function fetchBootstrapMeta(
  baseUrl = defaultBootstrapUrl(),
): Promise<BootstrapMeta | null> {
  try {
    const res = await fetch(`${baseUrl}/v1/meta`)
    if (!res.ok) return null
    return (await res.json()) as BootstrapMeta
  } catch {
    return null
  }
}

function defaultBootstrapUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:2468'
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http'
  const hostname = window.location.hostname || 'localhost'
  return `${protocol}://${hostname}:2468`
}
