import Fastify from 'fastify'
import cors from '@fastify/cors'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { openDatabase } from './db.ts'
import { registerSessionRoutes } from './routes/sessions.ts'
import { registerEventRoutes } from './routes/events.ts'
import { registerProjectRoutes } from './routes/projects.ts'

function parseOrigins(raw: string | undefined): string[] | true {
  if (!raw || raw.trim() === '*') return true
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function main() {
  const host = process.env.DROIDCODE_HOST ?? '0.0.0.0'
  const port = Number.parseInt(process.env.DROIDCODE_PORT ?? '2469', 10)
  const dbPath = process.env.DROIDCODE_DB ?? resolve(homedir(), '.local/share/droidcode/server.sqlite')
  const token = process.env.DROIDCODE_TOKEN
  const origins = parseOrigins(process.env.DROIDCODE_CORS)

  const db = openDatabase(dbPath)
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

  await app.register(cors, {
    origin: origins,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
  })

  if (token) {
    app.addHook('onRequest', async (req, reply) => {
      if (req.method === 'OPTIONS') return
      const header = req.headers.authorization ?? ''
      const match = /^Bearer\s+(.+)$/i.exec(header)
      if (!match || match[1] !== token) {
        reply.code(401).send({ error: 'unauthorized' })
      }
    })
  }

  app.get('/v1/health', async () => ({ status: 'ok' }))
  registerSessionRoutes(app, db)
  registerEventRoutes(app, db)
  registerProjectRoutes(app, db)

  const shutdown = async () => {
    try {
      await app.close()
    } finally {
      db.close()
    }
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ host, port })
  app.log.info(
    { port, dbPath, cors: origins === true ? '*' : origins, tokenProtected: !!token },
    'droidcode-server ready',
  )
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('server failed to start', err)
  process.exit(1)
})
