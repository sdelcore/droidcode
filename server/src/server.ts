import Fastify from 'fastify'
import cors from '@fastify/cors'
import { homedir, hostname } from 'node:os'
import { resolve } from 'node:path'
import { openDatabase } from './db.ts'
import { registerSessionRoutes } from './routes/sessions.ts'
import { registerEventRoutes } from './routes/events.ts'
import { registerProjectRoutes } from './routes/projects.ts'
import { spawnDaemon, type DaemonHandle } from './daemon.ts'

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

  const daemonEnabled = process.env.DROIDCODE_NO_DAEMON !== '1'
  const daemonBinary = process.env.DROIDCODE_DAEMON_BIN ?? 'sandbox-agent'
  const daemonPort = Number.parseInt(process.env.DROIDCODE_DAEMON_PORT ?? '2468', 10)
  const daemonHost = process.env.DROIDCODE_DAEMON_HOST ?? '0.0.0.0'
  const osHostname = hostname()
  // sandbox-agent doesn't accept `*` for --cors-allow-origin, only explicit
  // origins. Seed a reasonable list covering localhost, LAN hostname, and
  // anything the user appends via DROIDCODE_DAEMON_CORS (comma-separated).
  const vitePort = process.env.DROIDCODE_VITE_PORT ?? '5173'
  const defaultDaemonOrigins = [
    `http://localhost:${vitePort}`,
    `http://127.0.0.1:${vitePort}`,
    `http://${osHostname}:${vitePort}`,
  ]
  const extraDaemonOrigins = (process.env.DROIDCODE_DAEMON_CORS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const daemonCorsOrigins = Array.from(new Set([...defaultDaemonOrigins, ...extraDaemonOrigins]))

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

  let daemon: DaemonHandle | null = null
  if (daemonEnabled) {
    daemon = spawnDaemon({
      binary: daemonBinary,
      port: daemonPort,
      host: daemonHost,
      corsOrigins: daemonCorsOrigins,
      restartBackoffMs: 1_000,
      maxBackoffMs: 30_000,
      logger: app.log,
    })
  } else {
    app.log.info('DROIDCODE_NO_DAEMON=1; skipping sandbox-agent spawn')
  }

  app.get('/v1/health', async () => ({ status: 'ok' }))
  app.get('/v1/meta', async () => ({
    hostname: osHostname,
    home: homedir(),
    daemon: {
      enabled: daemonEnabled,
      port: daemonPort,
      running: daemon?.running ?? false,
      pid: daemon?.pid ?? null,
      lastStartedAt: daemon?.lastStartedAt ?? null,
      lastExitCode: daemon?.lastExitCode ?? null,
      corsOrigins: daemonCorsOrigins,
    },
  }))
  registerSessionRoutes(app, db)
  registerEventRoutes(app, db)
  registerProjectRoutes(app, db)

  const shutdown = async () => {
    try {
      if (daemon) await daemon.stop()
    } catch (err) {
      app.log.error({ err }, 'daemon stop failed')
    }
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
    {
      port,
      dbPath,
      cors: origins === true ? '*' : origins,
      tokenProtected: !!token,
      hostname: osHostname,
      daemon: {
        enabled: daemonEnabled,
        port: daemonPort,
        binary: daemonBinary,
        corsOrigins: daemonCorsOrigins,
      },
    },
    'droidcode-server ready',
  )
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('server failed to start', err)
  process.exit(1)
})
