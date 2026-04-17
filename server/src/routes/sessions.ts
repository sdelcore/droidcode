import type { FastifyInstance } from 'fastify'
import type { DbHandle } from '../db.ts'

interface SessionRow {
  id: string
  agent: string | null
  agent_session_id: string | null
  last_connection_id: string | null
  alias: string | null
  session_init: string | null
  created_at: number | null
  destroyed_at: number | null
  updated_at: number
}

export interface SessionPayload {
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

function rowToPayload(row: SessionRow): SessionPayload {
  return {
    id: row.id,
    agent: row.agent,
    agentSessionId: row.agent_session_id,
    lastConnectionId: row.last_connection_id,
    alias: row.alias,
    sessionInit: row.session_init ? JSON.parse(row.session_init) : null,
    createdAt: row.created_at,
    destroyedAt: row.destroyed_at,
    updatedAt: row.updated_at,
  }
}

export function registerSessionRoutes(app: FastifyInstance, db: DbHandle) {
  app.get('/v1/sessions', async () => {
    const rows = db.raw
      .prepare('SELECT * FROM sessions ORDER BY COALESCE(created_at, 0) DESC')
      .all() as SessionRow[]
    return { sessions: rows.map(rowToPayload) }
  })

  app.get<{ Params: { id: string } }>('/v1/sessions/:id', async (req, reply) => {
    const row = db.raw
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(req.params.id) as SessionRow | undefined
    if (!row) return reply.code(404).send({ error: 'not found' })
    return rowToPayload(row)
  })

  app.put<{ Params: { id: string }; Body: SessionPayload }>(
    '/v1/sessions/:id',
    async (req, reply) => {
      const id = req.params.id
      const body = req.body ?? { id }
      if (body.id && body.id !== id) {
        return reply.code(400).send({ error: 'id in body does not match path' })
      }
      const now = Date.now()
      const existing = db.raw
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(id) as SessionRow | undefined

      const merged = {
        agent: body.agent ?? existing?.agent ?? null,
        agent_session_id: body.agentSessionId ?? existing?.agent_session_id ?? null,
        last_connection_id: body.lastConnectionId ?? existing?.last_connection_id ?? null,
        alias:
          body.alias === undefined
            ? (existing?.alias ?? null)
            : body.alias === null || body.alias === ''
              ? null
              : body.alias,
        session_init:
          body.sessionInit === undefined
            ? (existing?.session_init ?? null)
            : body.sessionInit === null
              ? null
              : JSON.stringify(body.sessionInit),
        created_at: body.createdAt ?? existing?.created_at ?? now,
        destroyed_at: body.destroyedAt ?? existing?.destroyed_at ?? null,
      }

      db.raw
        .prepare(
          `INSERT INTO sessions
            (id, agent, agent_session_id, last_connection_id, alias, session_init,
             created_at, destroyed_at, updated_at)
           VALUES
            (@id, @agent, @agent_session_id, @last_connection_id, @alias, @session_init,
             @created_at, @destroyed_at, @updated_at)
           ON CONFLICT(id) DO UPDATE SET
            agent = excluded.agent,
            agent_session_id = excluded.agent_session_id,
            last_connection_id = excluded.last_connection_id,
            alias = excluded.alias,
            session_init = excluded.session_init,
            created_at = excluded.created_at,
            destroyed_at = excluded.destroyed_at,
            updated_at = excluded.updated_at`,
        )
        .run({ id, ...merged, updated_at: now })

      const after = db.raw.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow
      return rowToPayload(after)
    },
  )

  app.delete<{ Params: { id: string } }>('/v1/sessions/:id', async (req) => {
    db.raw.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id)
    return { ok: true }
  })
}
