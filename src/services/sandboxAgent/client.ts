import type { SessionRecord } from 'sandbox-agent'
import { SandboxAgent } from 'sandbox-agent'
import { IndexedDbSessionPersistDriver } from './persist-indexeddb'
import type { Host } from '@/types'

export const persist = new IndexedDbSessionPersistDriver()
const byHostId = new Map<number, Promise<SandboxAgent>>()
const byUrl = new Map<string, Promise<SandboxAgent>>()

// Insert a SessionRecord into the local persist driver if it isn't already
// there. Used to hydrate a fresh browser from the daemon-side metadata file
// so listSessions / resumeSession work without needing each session to have
// been created locally.
export async function seedSessionIfMissing(record: SessionRecord): Promise<boolean> {
  const existing = await persist.getSession(record.id)
  if (existing) return false
  await persist.updateSession(record)
  return true
}

export function hostBaseUrl(host: Pick<Host, 'host' | 'port' | 'isSecure'>): string {
  return `${host.isSecure ? 'https' : 'http'}://${host.host}:${host.port}`
}

export function connectToHost(host: Host): Promise<SandboxAgent> {
  const existing = byHostId.get(host.id)
  if (existing) return existing

  const sdkPromise = SandboxAgent.connect({
    baseUrl: hostBaseUrl(host),
    token: host.token,
    persist,
  })
    .then(async (sdk) => {
      // Dynamic import to break the cycle between client.ts and
      // metadataStore (which calls hostBaseUrl from this module).
      try {
        const mod = await import('@/services/sync/bootstrapFromMetadata')
        await mod.bootstrapFromMetadata(host)
      } catch (err) {
        console.error('metadata bootstrap failed', err)
      }
      return sdk
    })
    .catch((err) => {
      byHostId.delete(host.id)
      throw err
    })

  byHostId.set(host.id, sdkPromise)
  return sdkPromise
}

export function connectDaemon(baseUrl: string): Promise<SandboxAgent> {
  const key = baseUrl.replace(/\/+$/, '')
  const existing = byUrl.get(key)
  if (existing) return existing

  const sdkPromise = SandboxAgent.connect({ baseUrl: key, persist }).catch((err) => {
    byUrl.delete(key)
    throw err
  })

  byUrl.set(key, sdkPromise)
  return sdkPromise
}

export async function disconnectHost(hostId: number): Promise<void> {
  const entry = byHostId.get(hostId)
  if (!entry) return
  byHostId.delete(hostId)
  try {
    const sdk = await entry
    await sdk.dispose()
  } catch {
    // swallow — already failing or disposed
  }
}

export async function disconnectAll(): Promise<void> {
  const all = [...byHostId.values(), ...byUrl.values()]
  byHostId.clear()
  byUrl.clear()
  await Promise.allSettled(
    all.map(async (p) => {
      try {
        const sdk = await p
        await sdk.dispose()
      } catch {
        // ignore
      }
    }),
  )
}

export async function fetchHealth(host: Host | { baseUrl: string }): Promise<boolean> {
  const base = 'baseUrl' in host ? host.baseUrl : hostBaseUrl(host)
  try {
    const res = await fetch(`${base}/v1/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}
