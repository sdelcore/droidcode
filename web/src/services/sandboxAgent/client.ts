import { SandboxAgent } from 'sandbox-agent'
import { IndexedDbSessionPersistDriver } from './persist-indexeddb'
import type { Host } from '@/types'

const persist = new IndexedDbSessionPersistDriver()
const byHostId = new Map<number, Promise<SandboxAgent>>()
const byUrl = new Map<string, Promise<SandboxAgent>>()

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
  }).catch((err) => {
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
