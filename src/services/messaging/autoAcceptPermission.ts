import type { PermissionOutcome, PermissionRequestPayload } from '@/services/wagent'

export interface AutoAcceptSettings {
  autoAcceptPermissions: boolean
}

export type AutoAcceptDecision =
  | { kind: 'auto'; outcome: PermissionOutcome }
  | { kind: 'prompt' }

const PREFERRED_OUTCOMES: PermissionOutcome[] = ['allow_always', 'allow_once', 'reject']

// Decides what to do with a permission request given current settings. Auto-
// accepts only safe outcomes ('allow_*'). Reject is treated as prompt — we
// never auto-deny.
export function decide(
  req: PermissionRequestPayload,
  settings: AutoAcceptSettings,
): AutoAcceptDecision {
  if (!settings.autoAcceptPermissions) return { kind: 'prompt' }
  const outcome = PREFERRED_OUTCOMES.find((o) => req.availableOutcomes?.includes(o))
  if (!outcome || outcome === 'reject') return { kind: 'prompt' }
  return { kind: 'auto', outcome }
}
