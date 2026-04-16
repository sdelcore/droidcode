import { SandboxAgent } from 'sandbox-agent'

const cache = new Map<string, Promise<SandboxAgent>>()

export function connectDaemon(baseUrl: string): Promise<SandboxAgent> {
  const key = baseUrl.replace(/\/+$/, '')
  let entry = cache.get(key)
  if (!entry) {
    entry = SandboxAgent.connect({ baseUrl: key }).catch((err) => {
      cache.delete(key)
      throw err
    })
    cache.set(key, entry)
  }
  return entry
}
