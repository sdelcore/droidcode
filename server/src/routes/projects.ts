import type { FastifyInstance } from 'fastify'
import type { DbHandle } from '../db.ts'

interface ProjectRow {
  directory: string
  name: string
  created_at: number
  updated_at: number
}

export interface ProjectPayload {
  directory: string
  name: string
  createdAt?: number
  updatedAt?: number
}

function rowToPayload(row: ProjectRow): ProjectPayload {
  return {
    directory: row.directory,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function registerProjectRoutes(app: FastifyInstance, db: DbHandle) {
  app.get('/v1/projects', async () => {
    const rows = db.raw
      .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
      .all() as ProjectRow[]
    return { projects: rows.map(rowToPayload) }
  })

  app.put<{ Body: ProjectPayload }>('/v1/projects', async (req, reply) => {
    const body = req.body
    if (!body?.directory || !body.name) {
      return reply.code(400).send({ error: 'directory and name required' })
    }
    const now = Date.now()
    db.raw
      .prepare(
        `INSERT INTO projects (directory, name, created_at, updated_at)
         VALUES (@directory, @name, @now, @now)
         ON CONFLICT(directory) DO UPDATE SET
           name = excluded.name,
           updated_at = excluded.updated_at`,
      )
      .run({ directory: body.directory, name: body.name, now })
    const row = db.raw
      .prepare('SELECT * FROM projects WHERE directory = ?')
      .get(body.directory) as ProjectRow
    return rowToPayload(row)
  })

  app.delete<{ Querystring: { directory?: string } }>('/v1/projects', async (req, reply) => {
    const directory = req.query.directory
    if (!directory) return reply.code(400).send({ error: 'directory query required' })
    db.raw.prepare('DELETE FROM projects WHERE directory = ?').run(directory)
    return { ok: true }
  })
}
