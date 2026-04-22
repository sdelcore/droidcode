import type { Host } from '@/types'
import { hostBaseUrl } from '@/services/sandboxAgent/client'

export interface CompanionSession {
  id: string
  agent?: string | null
  agentSessionId?: string | null
  lastConnectionId?: string | null
  alias?: string | null
  sessionInit?: unknown
  createdAt?: number | null
  destroyedAt?: number | null
  updatedAt?: number
}

export interface CompanionProject {
  directory: string
  name: string
  createdAt?: number
  updatedAt?: number
}

export interface CompanionEvent {
  id: string
  sessionId: string
  eventIndex: number
  sender: 'client' | 'agent'
  createdAt: number
  connectionId: string | null
  payload: unknown
}

export function companionBaseUrl(host: Host): string {
  if (host.companionUrl && host.companionUrl.trim().length > 0) {
    return host.companionUrl.replace(/\/+$/, '')
  }
  const scheme = host.isSecure ? 'https' : 'http'
  return `${scheme}://${host.host}:2469`
}

function authHeaders(host: Host): Record<string, string> {
  const tok = host.companionToken ?? host.token
  return tok ? { authorization: `Bearer ${tok}` } : {}
}

async function request<T>(host: Host, path: string, init: RequestInit = {}): Promise<T> {
  const url = `${companionBaseUrl(host)}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...authHeaders(host),
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${text}`)
  }
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return undefined as T
  return (await res.json()) as T
}

// Resolves to false if the companion isn't reachable (lets the app keep
// working in degraded mode without continuous retries).
export async function isCompanionReachable(host: Host): Promise<boolean> {
  try {
    const res = await fetch(`${companionBaseUrl(host)}/v1/health`, {
      headers: authHeaders(host),
    })
    return res.ok
  } catch {
    return false
  }
}

export interface CompanionMeta {
  hostname: string
  daemon: {
    enabled: boolean
    port: number
    running: boolean
    pid: number | null
    lastStartedAt: number | null
    lastExitCode: number | null
    corsOrigins: string[]
  }
}

// Bootstrap meta fetch — used on first run before any Host exists. Assumes
// the companion runs on the same machine as the web server at :2469.
export async function fetchBootstrapMeta(
  baseUrl = defaultBootstrapCompanionUrl(),
): Promise<CompanionMeta | null> {
  try {
    const res = await fetch(`${baseUrl}/v1/meta`)
    if (!res.ok) return null
    return (await res.json()) as CompanionMeta
  } catch {
    return null
  }
}

function defaultBootstrapCompanionUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:2469'
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http'
  const host = window.location.hostname || 'localhost'
  return `${protocol}://${host}:2469`
}

export async function listSessions(host: Host): Promise<CompanionSession[]> {
  const res = await request<{ sessions: CompanionSession[] }>(host, '/v1/sessions')
  return res.sessions ?? []
}

export async function upsertSession(
  host: Host,
  session: CompanionSession,
): Promise<CompanionSession> {
  return request<CompanionSession>(host, `/v1/sessions/${encodeURIComponent(session.id)}`, {
    method: 'PUT',
    body: JSON.stringify(session),
  })
}

export async function deleteSession(host: Host, sessionId: string): Promise<void> {
  await request(host, `/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

export async function listProjects(host: Host): Promise<CompanionProject[]> {
  const res = await request<{ projects: CompanionProject[] }>(host, '/v1/projects')
  return res.projects ?? []
}

export async function upsertProject(
  host: Host,
  project: CompanionProject,
): Promise<CompanionProject> {
  return request<CompanionProject>(host, '/v1/projects', {
    method: 'PUT',
    body: JSON.stringify(project),
  })
}

export async function deleteProject(host: Host, directory: string): Promise<void> {
  await request(host, `/v1/projects?directory=${encodeURIComponent(directory)}`, {
    method: 'DELETE',
  })
}

export async function listEvents(
  host: Host,
  sessionId: string,
  options: { after?: number; limit?: number } = {},
): Promise<CompanionEvent[]> {
  const params = new URLSearchParams()
  if (options.after !== undefined) params.set('after', String(options.after))
  if (options.limit !== undefined) params.set('limit', String(options.limit))
  const qs = params.toString()
  const res = await request<{ events: CompanionEvent[] }>(
    host,
    `/v1/sessions/${encodeURIComponent(sessionId)}/events${qs ? `?${qs}` : ''}`,
  )
  return res.events ?? []
}

export async function postEvents(
  host: Host,
  sessionId: string,
  events: CompanionEvent[],
): Promise<{ inserted: number; received: number }> {
  if (events.length === 0) return { inserted: 0, received: 0 }
  return request<{ inserted: number; received: number }>(
    host,
    `/v1/sessions/${encodeURIComponent(sessionId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify({ events }),
    },
  )
}

// Utility so other modules don't have to import hostBaseUrl separately.
export { hostBaseUrl }
