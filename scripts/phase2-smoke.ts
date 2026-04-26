// End-to-end smoke for the wagent HTTP+SSE client.
//
// Drives the same client the React app uses, but from a Node script — so
// any drift between the v1 wire and the typed client surfaces here
// before it lands on a user's screen. Defaults to a local wagent on
// :2468; override with WAGENT_URL=http://host:port.
//
// Usage:
//   npm run smoke                          # claude (needs auth)
//   SMOKE_AGENT=echo npm run smoke         # stub agent — no creds needed
//   WAGENT_URL=http://nightman:2468 npm run smoke

import { createWagentClient } from '../src/services/wagent'
import type { EventEnvelope } from '../src/services/wagent'
import type { Host } from '../src/types/domain'
import { MessageAccumulator } from '../src/services/messaging/accumulator'

const baseUrl = process.env.WAGENT_URL ?? 'http://localhost:2468'
const agent = (process.env.SMOKE_AGENT ?? 'claude') as 'echo' | 'claude' | 'pi'
const promptText = process.env.SMOKE_PROMPT ?? 'Say hi in three words.'

function parseBaseUrl(u: string): Host {
  const url = new URL(u)
  const port = Number.parseInt(
    url.port || (url.protocol === 'https:' ? '443' : '80'),
    10,
  )
  return {
    id: 0,
    name: 'smoke',
    host: url.hostname,
    port,
    isSecure: url.protocol === 'https:',
    token: process.env.WAGENT_TOKEN,
    createdAt: Date.now(),
  }
}

async function main() {
  const host = parseBaseUrl(baseUrl)
  const client = createWagentClient(host)

  console.log(`→ ${baseUrl}`)
  if (!(await client.health())) throw new Error('wagent /v1/health did not return ok')

  const meta = await client.getMeta()
  console.log(`  wagent ${meta.version} on ${meta.hostname}`)

  const agents = await client.listAgents()
  const picked = agents.find((a) => a.id === agent)
  if (!picked) throw new Error(`agent "${agent}" not listed`)
  if (!picked.installed) {
    throw new Error(
      `agent "${agent}" not installed: ${picked.notes ?? picked.reason ?? 'unknown'}`,
    )
  }
  console.log(
    `  agents: ${agents.filter((a) => a.installed).map((a) => a.id).join(', ')}`,
  )

  console.log(`→ create ${agent} session`)
  const session = await client.createSession({ agent, cwd: process.cwd() })
  console.log(`  ${session.id}`)

  const events: EventEnvelope[] = []
  const accumulator = new MessageAccumulator()
  const stopped = new Promise<EventEnvelope>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out waiting for stop')), 90_000)
    const unsub = client.subscribeEvents(session.id, (ev) => {
      events.push(ev)
      accumulator.push(ev)
      if (ev.kind === 'stop') {
        clearTimeout(t)
        unsub()
        resolve(ev)
      }
    })
  })

  await new Promise((r) => setTimeout(r, 150))

  console.log(`→ prompt: ${promptText}`)
  await client.sendMessage(session.id, [{ type: 'text', text: promptText }])

  const stop = await stopped
  const reason = (stop.payload as { reason?: string }).reason ?? '(none)'
  console.log(`  stop reason: ${reason}`)

  console.log(`\n── accumulator (${accumulator.messages.length} messages) ──`)
  for (const msg of accumulator.messages) {
    const text = msg.parts
      .map((p) => (p.kind === 'tool_call' ? `[tool:${p.toolName}:${p.toolStatus}]` : p.content))
      .join('')
    console.log(`  [${msg.role}] ${text.replace(/\n/g, ' ').slice(0, 160)}`)
  }
  console.log(`\n── ${events.length} events; last index ${events.at(-1)?.eventIndex} ──`)

  console.log('→ destroy session')
  await client.deleteSession(session.id)
  console.log('✓ smoke passed')
}

main().catch((err) => {
  console.error('✗ smoke failed')
  console.error(err)
  process.exit(1)
})
