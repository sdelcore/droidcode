import type { AgentKind } from '@/services/wagent'

const HOST_HUE_VARS = [
  'var(--host-1)',
  'var(--host-2)',
  'var(--host-3)',
  'var(--host-4)',
  'var(--host-5)',
] as const

export function hostHue(hostId: number): string {
  const idx = ((hostId % HOST_HUE_VARS.length) + HOST_HUE_VARS.length) % HOST_HUE_VARS.length
  return HOST_HUE_VARS[idx]
}

const AGENT_TONE_VARS: Record<AgentKind, string> = {
  claude: 'var(--agent-claude)',
  pi: 'var(--agent-pi)',
  echo: 'var(--agent-echo)',
}

export function agentTone(agent: AgentKind | undefined): string {
  if (!agent) return 'var(--muted-foreground)'
  return AGENT_TONE_VARS[agent] ?? 'var(--muted-foreground)'
}

const AGENT_SIGILS: Record<AgentKind, string> = {
  claude: 'CL',
  pi: 'PI',
  echo: 'EC',
}

export function agentSigil(agent: AgentKind | undefined): string {
  if (!agent) return '··'
  return AGENT_SIGILS[agent] ?? '··'
}

const AGENT_NAMES: Record<AgentKind, string> = {
  claude: 'Claude',
  pi: 'Pi',
  echo: 'Echo',
}

export function agentName(agent: AgentKind | undefined): string {
  if (!agent) return 'Agent'
  return AGENT_NAMES[agent] ?? agent
}

export function relTime(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function relTimeFromMs(timestamp: number, now = Date.now()): string {
  return relTime(Math.max(0, (now - timestamp) / 1000))
}
