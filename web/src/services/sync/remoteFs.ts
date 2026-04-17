import type { Host } from '@/types'
import { hostBaseUrl } from '@/services/sandboxAgent/client'

// The daemon's filesystem-oriented REST endpoints give us a tiny
// share-across-clients store without needing any extra infrastructure.
// Here we layer on top:
//   - $HOME discovery (one-off per host)
//   - readFile / writeFile JSON helpers
// The metadata file lives at `$HOME/.droidcode.json` by default.

const homeByHostId = new Map<number, Promise<string>>()

function hostKey(host: Host): string {
  return `${host.id}`
}

async function fetchHome(host: Host): Promise<string> {
  const base = hostBaseUrl(host)
  const token = host.token
  const res = await fetch(`${base}/v1/processes/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      command: 'sh',
      args: ['-c', 'printf %s "$HOME"'],
    }),
  })
  if (!res.ok) throw new Error(`home discovery failed: ${res.status}`)
  const json = (await res.json()) as { stdout?: string; exitCode?: number }
  const home = (json.stdout ?? '').trim()
  if (!home.startsWith('/')) {
    throw new Error(`home discovery returned unexpected value: ${JSON.stringify(json.stdout)}`)
  }
  return home
}

export function getHomeDir(host: Host): Promise<string> {
  const key = hostKey(host)
  let entry = homeByHostId.get(host.id)
  if (!entry) {
    entry = fetchHome(host).catch((err) => {
      homeByHostId.delete(host.id)
      throw err
    })
    homeByHostId.set(host.id, entry)
  }
  void key
  return entry
}

export async function metadataPath(host: Host): Promise<string> {
  const home = await getHomeDir(host)
  return `${home}/.droidcode.json`
}

function authHeaders(host: Host): Record<string, string> {
  return host.token ? { authorization: `Bearer ${host.token}` } : {}
}

export async function readRemoteJson<T>(host: Host, path: string): Promise<T | null> {
  const base = hostBaseUrl(host)
  const url = `${base}/v1/fs/file?path=${encodeURIComponent(path)}`
  const res = await fetch(url, { headers: authHeaders(host) })
  if (res.status === 404) return null
  // Daemon returns 400 with "path not found" for some missing files.
  if (res.status === 400) {
    const body = await res.text()
    if (/path not found/i.test(body)) return null
    throw new Error(`readRemoteJson ${path}: ${res.status} ${body}`)
  }
  if (!res.ok) throw new Error(`readRemoteJson ${path}: ${res.status}`)
  const text = await res.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as T
  } catch (err) {
    throw new Error(
      `readRemoteJson ${path}: invalid JSON (${err instanceof Error ? err.message : 'parse error'})`,
    )
  }
}

export async function writeRemoteJson(host: Host, path: string, value: unknown): Promise<void> {
  const base = hostBaseUrl(host)
  const url = `${base}/v1/fs/file?path=${encodeURIComponent(path)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(host),
    },
    body: JSON.stringify(value),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`writeRemoteJson ${path}: ${res.status} ${text}`)
  }
}
