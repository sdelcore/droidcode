import type { Session } from '@/services/wagent'
import type { SessionFilters, SessionPreferences, SortPreset } from '@/types'
import { getWorkflowPriority } from '@/types'

// Mode is no longer carried on Session in v1 (Rivet's modes.currentModeId
// went away). Keeping the helper so callers don't have to change yet.
export function sessionMode(_session: Session): string | undefined {
  void _session
  return undefined
}

export function isSessionRunning(s: Session): boolean {
  return s.destroyedAt === null
}

export function sessionCwd(s: Session): string | undefined {
  return s.cwd ?? undefined
}

export function sessionDisplayName(s: Session, prefs?: SessionPreferences): string {
  // Prefer the local pref alias (legacy), then the server-side alias on
  // the Session row, then the id. Once all sessions are wagent-native this
  // collapses to s.alias || s.id.
  return prefs?.alias || s.alias || s.id
}

export function applyFilters(
  sessions: Session[],
  filters: SessionFilters,
  options: { cwd?: string } = {},
): Session[] {
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
  sessions: Session[],
  preset: SortPreset,
  prefsBySessionId: Record<string, SessionPreferences | undefined> = {},
): Session[] {
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
      copy.sort((a, b) => latestActivity(b) - latestActivity(a))
      break
  }

  return copy
}

function latestActivity(s: Session): number {
  return s.destroyedAt ?? s.updatedAt ?? s.createdAt
}

function duration(s: Session): number {
  if (s.destroyedAt) return s.destroyedAt - s.createdAt
  return Date.now() - s.createdAt
}
