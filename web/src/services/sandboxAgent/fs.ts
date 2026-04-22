import type { Host } from '@/types'
import { hostBaseUrl } from './client'

export type FsEntryType = 'directory' | 'file' | 'symlink' | 'unknown'

export interface FsEntry {
  name: string
  path: string
  entryType: FsEntryType
  size?: number
  modified?: string
}

function authHeaders(host: Host): Record<string, string> {
  return host.token ? { authorization: `Bearer ${host.token}` } : {}
}

// Rivet's daemon exposes GET /v1/fs/entries?path=<abs>. It does NOT expand
// ~ (see SDK_LIMITATIONS row 13) — always pass an absolute path.
export async function listFsEntries(host: Host, path: string): Promise<FsEntry[]> {
  const url = `${hostBaseUrl(host)}/v1/fs/entries?path=${encodeURIComponent(path)}`
  const res = await fetch(url, { headers: authHeaders(host) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Browse ${path}: ${res.status} ${text || res.statusText}`)
  }
  const data = (await res.json()) as FsEntry[]
  return Array.isArray(data) ? data : []
}
