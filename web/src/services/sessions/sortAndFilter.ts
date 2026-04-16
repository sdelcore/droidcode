import type { SessionRecord } from 'sandbox-agent'
import type { SessionFilters, SessionPreferences, SortPreset } from '@/types'
import { getWorkflowPriority } from '@/types'

export function sessionMode(s: SessionRecord): string | undefined {
  return s.modes?.currentModeId ?? undefined
}

export function isSessionRunning(s: SessionRecord): boolean {
  return s.destroyedAt === undefined || s.destroyedAt === null
}

export function sessionCwd(s: SessionRecord): string | undefined {
  const init = s.sessionInit as { cwd?: string } | undefined
  return init?.cwd
}

export function sessionDisplayName(
  s: SessionRecord,
  prefs?: SessionPreferences,
): string {
  return prefs?.alias || s.id
}

export function applyFilters(
  sessions: SessionRecord[],
  filters: SessionFilters,
  options: { cwd?: string } = {},
): SessionRecord[] {
  return sessions.filter((s) => {
    if (options.cwd && sessionCwd(s) !== options.cwd) return false

    if (filters.modes.size > 0) {
      const m = sessionMode(s)
      if (!m || !filters.modes.has(m)) return false
    }

    if (filters.statuses.size > 0) {
      const running = isSessionRunning(s)
      const label = running ? 'running' : 'completed'
      if (!filters.statuses.has(label)) return false
    }

    return true
  })
}

export function applySort(
  sessions: SessionRecord[],
  preset: SortPreset,
  prefsBySessionId: Record<string, SessionPreferences | undefined> = {},
): SessionRecord[] {
  const copy = sessions.slice()

  switch (preset) {
    case 'recent':
      copy.sort((a, b) => latestActivity(b) - latestActivity(a))
      break
    case 'created':
      copy.sort((a, b) => a.createdAt - b.createdAt)
      break
    case 'duration':
      copy.sort((a, b) => duration(b) - duration(a))
      break
    case 'workflow':
      copy.sort((a, b) => {
        const pa = getWorkflowPriority(sessionMode(a), isSessionRunning(a))
        const pb = getWorkflowPriority(sessionMode(b), isSessionRunning(b))
        if (pa !== pb) return pa - pb
        return latestActivity(b) - latestActivity(a)
      })
      break
    case 'alpha':
      copy.sort((a, b) =>
        sessionDisplayName(a, prefsBySessionId[a.id]).localeCompare(
          sessionDisplayName(b, prefsBySessionId[b.id]),
        ),
      )
      break
    case 'files':
      // Per-session file counts come from event payload analysis,
      // which is out of scope for the session list; fall back to recent.
      copy.sort((a, b) => latestActivity(b) - latestActivity(a))
      break
  }

  return copy
}

function latestActivity(s: SessionRecord): number {
  return s.destroyedAt ?? s.createdAt
}

function duration(s: SessionRecord): number {
  if (s.destroyedAt) return s.destroyedAt - s.createdAt
  return Date.now() - s.createdAt
}
