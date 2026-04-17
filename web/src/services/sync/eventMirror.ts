import type { SessionEvent } from 'sandbox-agent'
import type { Host } from '@/types'
import { postEvents, type CompanionEvent } from './companion'

// Best-effort mirror of every live SessionEvent up to the companion server.
// Events are batched with a small debounce so a burst of streaming chunks
// doesn't each become its own POST. Failures are logged and retried on
// the next flush; we never drop events on the floor unless the user
// closes the chat pane.

const BATCH_DEBOUNCE_MS = 300
const MAX_BATCH = 50

interface Queue {
  host: Host
  sessionId: string
  pending: Map<string, SessionEvent>
  timer: ReturnType<typeof setTimeout> | null
  draining: Promise<void> | null
}

const queues = new Map<string, Queue>()

function key(hostId: number, sessionId: string): string {
  return `${hostId}:${sessionId}`
}

function toCompanion(event: SessionEvent): CompanionEvent {
  return {
    id: event.id,
    sessionId: event.sessionId,
    eventIndex: event.eventIndex,
    sender: event.sender,
    createdAt: event.createdAt,
    connectionId: event.connectionId ?? null,
    payload: event.payload,
  }
}

async function drain(q: Queue): Promise<void> {
  while (q.pending.size > 0) {
    const batch: SessionEvent[] = []
    // Take up to MAX_BATCH from the map, preserving insertion order.
    for (const [id, event] of q.pending) {
      if (batch.length >= MAX_BATCH) break
      batch.push(event)
      q.pending.delete(id)
    }
    if (batch.length === 0) break
    try {
      await postEvents(q.host, q.sessionId, batch.map(toCompanion))
    } catch (err) {
      console.error('event mirror POST failed, re-queueing', err)
      // Re-queue (insertion order not exact, but good enough).
      for (const e of batch) {
        if (!q.pending.has(e.id)) q.pending.set(e.id, e)
      }
      // Back off to avoid hammering the server.
      await new Promise((r) => setTimeout(r, 1500))
      // Abort the drain loop; next enqueue will restart it.
      break
    }
  }
}

function scheduleDrain(q: Queue): void {
  if (q.timer) return
  q.timer = setTimeout(() => {
    q.timer = null
    if (q.draining) return
    q.draining = drain(q).finally(() => {
      q.draining = null
      if (q.pending.size > 0) scheduleDrain(q)
    })
  }, BATCH_DEBOUNCE_MS)
}

export function attachEventMirror(host: Host, sessionId: string): void {
  const k = key(host.id, sessionId)
  if (queues.has(k)) return
  queues.set(k, {
    host,
    sessionId,
    pending: new Map(),
    timer: null,
    draining: null,
  })
}

export function detachEventMirror(hostId: number, sessionId: string): void {
  const k = key(hostId, sessionId)
  const q = queues.get(k)
  if (!q) return
  if (q.timer) clearTimeout(q.timer)
  // Let any in-flight drain finish, but drop what's still queued.
  queues.delete(k)
}

export function enqueueEvent(hostId: number, sessionId: string, event: SessionEvent): void {
  const q = queues.get(key(hostId, sessionId))
  if (!q) return
  if (q.pending.has(event.id)) return
  q.pending.set(event.id, event)
  scheduleDrain(q)
}
