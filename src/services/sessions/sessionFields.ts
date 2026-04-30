import type { Session } from '@/services/wagent'
import type { SessionPreferences } from '@/types'

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
