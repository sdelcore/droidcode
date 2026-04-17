import type { FastifyInstance } from 'fastify'
import type { DbHandle } from '../db.ts'

interface EventRow {
  id: string
  session_id: string
  event_index: number
  sender: string
  created_at: number
  connection_id: string | null
  payload: string
}

export interface EventPayload {
  id: string
  sessionId: string
  eventIndex: number
  sender: 'client' | 'agent'
  createdAt: number
  connectionId: string | null
  payload: unknown
}

function rowToPayload(row: EventRow): EventPayload {
  return {
    id: row.id,
    sessionId: row.session_id,
    eventIndex: row.event_index,
    sender: row.sender === 'client' ? 'client' : 'agent',
    createdAt: row.created_at,
    connectionId: row.connection_id,
    payload: JSON.parse(row.payload),
  }
}

const MAX_LIMIT = 2000

export function registerEventRoutes(app: FastifyInstance, db: DbHandle) {
  app.get<{
    Params: { id: string }
    Querystring: { limit?: string; after?: string }
  }>('/v1/sessions/:id/events', async (req) => {
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(req.query.limit ?? '500', 10) || 500),
    )
    const after = req.query.after ? Number.parseInt(req.query.after, 10) : undefined

    const rows = (
      after !== undefined && Number.isFinite(after)
        ? (db.raw
            .prepare(
              `SELECT * FROM events
               WHERE session_id = ? AND event_index > ?
               ORDER BY event_index ASC, id ASC
               LIMIT ?`,
            )
            .all(req.params.id, after, limit) as EventRow[])
        : (db.raw
            .prepare(
              `SELECT * FROM events
               WHERE session_id = ?
               ORDER BY event_index ASC, id ASC
               LIMIT ?`,
            )
            .all(req.params.id, limit) as EventRow[])
    )

    return { events: rows.map(rowToPayload) }
  })

  app.post<{ Params: { id: string }; Body: EventPayload | { events: EventPayload[] } }>(
    '/v1/sessions/:id/events',
    async (req) => {
      const events =
        'events' in req.body && Array.isArray(req.body.events)
          ? req.body.events
          : 'id' in req.body
            ? [req.body as EventPayload]
            : []

      // Auto-upsert a shell session row so clients can POST events
      // without having registered the session first (happens when the
      // session was created while the companion was offline).
      const ensureSession = db.raw.prepare(
        `INSERT OR IGNORE INTO sessions (id, created_at, updated_at)
         VALUES (?, ?, ?)`,
      )
      const stmt = db.raw.prepare(
        `INSERT OR IGNORE INTO events
          (id, session_id, event_index, sender, created_at, connection_id, payload)
         VALUES
          (@id, @session_id, @event_index, @sender, @created_at, @connection_id, @payload)`,
      )
      const tx = db.raw.transaction((evts: EventPayload[]) => {
        const now = Date.now()
        ensureSession.run(req.params.id, now, now)
        let inserted = 0
        for (const e of evts) {
          const result = stmt.run({
            id: e.id,
            session_id: req.params.id,
            event_index: e.eventIndex,
            sender: e.sender,
            created_at: e.createdAt,
            connection_id: e.connectionId,
            payload: JSON.stringify(e.payload),
          })
          if (result.changes > 0) inserted++
        }
        return inserted
      })
      const inserted = tx(events)
      return { inserted, received: events.length }
    },
  )
}
