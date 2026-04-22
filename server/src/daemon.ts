import { spawn, type ChildProcess } from 'node:child_process'
import type { FastifyBaseLogger } from 'fastify'

export interface DaemonOptions {
  binary: string
  port: number
  host: string
  corsOrigins: string[]
  restartBackoffMs: number
  maxBackoffMs: number
  logger: FastifyBaseLogger
}

export interface DaemonHandle {
  readonly running: boolean
  readonly pid: number | null
  readonly port: number
  readonly lastStartedAt: number | null
  readonly lastExitCode: number | null
  stop: () => Promise<void>
}

export function spawnDaemon(opts: DaemonOptions): DaemonHandle {
  const log = opts.logger.child({ subsystem: 'daemon' })
  let child: ChildProcess | null = null
  let stopping = false
  let restartDelay = opts.restartBackoffMs
  let lastStartedAt: number | null = null
  let lastExitCode: number | null = null

  const args = [
    'server',
    '--no-token',
    '--host',
    opts.host,
    '--port',
    String(opts.port),
    ...opts.corsOrigins.flatMap((origin) => ['--cors-allow-origin', origin]),
  ]

  function start(): void {
    if (stopping) return
    log.info({ binary: opts.binary, port: opts.port }, 'starting sandbox-agent daemon')
    const proc = spawn(opts.binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    child = proc
    lastStartedAt = Date.now()

    proc.stdout?.on('data', (buf) => {
      for (const line of buf.toString('utf8').split('\n')) {
        if (line.trim()) log.info({ stream: 'stdout' }, line)
      }
    })
    proc.stderr?.on('data', (buf) => {
      for (const line of buf.toString('utf8').split('\n')) {
        if (line.trim()) log.warn({ stream: 'stderr' }, line)
      }
    })

    proc.on('error', (err) => {
      log.error({ err }, 'sandbox-agent spawn error')
    })

    proc.on('exit', (code, signal) => {
      lastExitCode = code ?? null
      log.warn({ code, signal }, 'sandbox-agent exited')
      child = null
      if (stopping) return
      setTimeout(start, restartDelay)
      restartDelay = Math.min(restartDelay * 2, opts.maxBackoffMs)
    })

    // Reset backoff once the process has been alive for >10s.
    setTimeout(() => {
      if (child === proc) restartDelay = opts.restartBackoffMs
    }, 10_000)
  }

  function stop(): Promise<void> {
    stopping = true
    const proc = child
    if (!proc) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL')
      }, 3_000)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      proc.kill('SIGTERM')
    })
  }

  start()

  return {
    get running() {
      return child !== null && !child.killed
    },
    get pid() {
      return child?.pid ?? null
    },
    get port() {
      return opts.port
    },
    get lastStartedAt() {
      return lastStartedAt
    },
    get lastExitCode() {
      return lastExitCode
    },
    stop,
  }
}
