import type { Host } from '@/types'
import type { EventEnvelope } from './types'
import { wagentBaseUrl } from './client'

// Browser EventSource doesn't let us set headers (so no Bearer token,
// no `Last-Event-ID` override). For solo-deploy with no token we can
// use it directly. For token / Last-Event-ID resume we hand-roll
// using fetch + ReadableStream — same pattern as wagent's own smoke test.

interface SubscribeOpts {
  lastEventId?: number
  onError?: (err: Event | Error) => void
}

export function subscribeEvents(
  host: Host,
  sessionId: string,
  listener: (event: EventEnvelope) => void,
  opts: SubscribeOpts = {},
): () => void {
  const url = `${wagentBaseUrl(host)}/v1/sessions/${encodeURIComponent(sessionId)}/events/stream`
  const needsCustomTransport = !!host.token || opts.lastEventId !== undefined

  if (!needsCustomTransport && typeof EventSource !== 'undefined') {
    const source = new EventSource(url)
    source.addEventListener('session_update', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as EventEnvelope
        listener(data)
      } catch {
        // ignore malformed events
      }
    })
    if (opts.onError) source.addEventListener('error', opts.onError)
    return () => source.close()
  }

  // Custom transport for the cases EventSource can't handle.
  const ctrl = new AbortController()
  void runFetchSse(host, url, listener, opts, ctrl).catch((err) => {
    if (ctrl.signal.aborted) return
    if (opts.onError) opts.onError(err instanceof Error ? err : new Error(String(err)))
  })
  return () => ctrl.abort()
}

async function runFetchSse(
  host: Host,
  url: string,
  listener: (event: EventEnvelope) => void,
  opts: SubscribeOpts,
  ctrl: AbortController,
): Promise<void> {
  const headers: Record<string, string> = {}
  if (host.token) headers.authorization = `Bearer ${host.token}`
  if (opts.lastEventId !== undefined) headers['last-event-id'] = String(opts.lastEventId)

  const res = await fetch(url, { headers, signal: ctrl.signal })
  if (!res.ok || !res.body) {
    throw new Error(`SSE connect failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx = buf.indexOf('\n\n')
    while (idx !== -1) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const event = parseSseBlock(block)
      if (event) {
        try {
          listener(event)
        } catch {
          // listener errors don't kill the stream
        }
      }
      idx = buf.indexOf('\n\n')
    }
  }
}

function parseSseBlock(block: string): EventEnvelope | null {
  let data: string | null = null
  let eventName: string | null = null
  for (const line of block.split('\n')) {
    if (line.startsWith(': ')) continue
    if (line.startsWith('event: ')) eventName = line.slice(7)
    else if (line.startsWith('data: ')) data = line.slice(6)
  }
  if (data === null) return null
  if (eventName !== null && eventName !== 'session_update') return null
  try {
    return JSON.parse(data) as EventEnvelope
  } catch {
    return null
  }
}
