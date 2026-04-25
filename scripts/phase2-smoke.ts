import { InMemorySessionPersistDriver, SandboxAgent, type SessionEvent } from 'sandbox-agent'
import { MessageAccumulator } from '../src/services/messaging/accumulator'

const baseUrl = process.env.SANDBOX_AGENT_URL ?? 'http://localhost:2468'
const agentId = process.env.SMOKE_AGENT ?? 'claude'
const prompt = process.env.SMOKE_PROMPT ?? 'Say hi in three words.'

async function main() {
  console.log(`→ connecting to ${baseUrl}`)
  const sdk = await SandboxAgent.connect({
    baseUrl,
    persist: new InMemorySessionPersistDriver(),
  })

  const agentsRes = await sdk.listAgents()
  const available = agentsRes.agents.map((a) => a.id)
  console.log(`  agents available: ${available.join(', ')}`)
  const picked = agentsRes.agents.find((a) => a.id === agentId)
  if (!picked) throw new Error(`agent "${agentId}" not listed on daemon`)
  if (!picked.installed) throw new Error(`agent "${agentId}" is not installed`)

  console.log(`→ creating ${agentId} session`)
  const session = await sdk.createSession({ agent: agentId, cwd: process.cwd() })
  console.log(`  sessionId=${session.id}`)

  const accumulator = new MessageAccumulator()
  const eventsSeen: SessionEvent[] = []

  const unsubscribe = session.onEvent((event) => {
    eventsSeen.push(event)
    accumulator.push(event)
  })

  try {
    console.log(`→ prompting: ${prompt}`)
    const res = await session.prompt([{ type: 'text', text: prompt }])
    console.log(`  stopReason=${res?.stopReason ?? '(none)'}`)
  } finally {
    unsubscribe()
  }

  await new Promise((resolve) => setTimeout(resolve, 500))

  console.log(`\n── accumulator (${accumulator.messages.length} messages) ──`)
  for (const msg of accumulator.messages) {
    const text = msg.parts
      .map((p) => (p.kind === 'tool_call' ? `[tool:${p.toolName}:${p.toolStatus}]` : p.content))
      .join('')
    console.log(`  [${msg.role}] ${text.replace(/\n/g, ' ')}`)
  }

  console.log(`\n── raw events (${eventsSeen.length}) ──`)
  for (const ev of eventsSeen.slice(0, 20)) {
    const payload = ev.payload as { method?: string; params?: { update?: { sessionUpdate?: string } } }
    const kind = payload?.method === 'session/update'
      ? `update:${payload.params?.update?.sessionUpdate ?? '?'}`
      : (payload?.method ?? 'response')
    console.log(`  #${ev.eventIndex} ${ev.sender}  ${kind}`)
  }

  console.log('\n→ destroying session')
  await sdk.destroySession(session.id)
  await sdk.dispose()
  console.log('✓ Phase 2 smoke test complete')
}

main().catch((err) => {
  console.error('✗ Phase 2 smoke test failed')
  console.error(err)
  process.exit(1)
})
