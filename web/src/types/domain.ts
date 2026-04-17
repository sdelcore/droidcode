import type { SessionRecord } from 'sandbox-agent'

// ============================================================================
// Host — a Rivet sandbox-agent daemon the user wants to connect to.
// ============================================================================

export interface Host {
  id: number
  name: string
  host: string
  port: number
  isSecure: boolean
  token?: string
  // Base URL of the droidcode-server companion. If unset, we assume it
  // runs at the same host with port 2469.
  companionUrl?: string
  // If set, sent as Bearer auth to the companion. Optional.
  companionToken?: string
  lastConnected?: number
  createdAt: number
}

// ============================================================================
// Project — a remembered cwd per host. Rivet has no spawn/stop lifecycle;
// "project" is purely a UX concept so users don't retype directories.
// ============================================================================

export interface ProjectFolder {
  id: number
  hostId: number
  name: string
  directory: string
  lastUsed?: number
  createdAt: number
}

// ============================================================================
// Thinking mode — client-side preset. The SDK may override this per-agent
// via session.getConfigOptions(); this is just the default picker.
// ============================================================================

export type ThinkingModeType = 'normal' | 'high' | 'max'

export interface ThinkingMode {
  type: ThinkingModeType
  displayName: string
  description: string
  budgetTokens: number | null
}

export const THINKING_MODES: Record<ThinkingModeType, ThinkingMode> = {
  normal: {
    type: 'normal',
    displayName: 'Normal',
    description: 'Standard thinking',
    budgetTokens: null,
  },
  high: {
    type: 'high',
    displayName: 'High',
    description: '8K token budget',
    budgetTokens: 8000,
  },
  max: {
    type: 'max',
    displayName: 'Max',
    description: '32K token budget',
    budgetTokens: 32000,
  },
}

// ============================================================================
// Slash commands — client-side only for v1. Rivet doesn't centralize these.
// ============================================================================

export interface SlashCommand {
  name: string
  description: string
  isBuiltIn: boolean
}

export const BUILT_IN_COMMANDS: SlashCommand[] = [
  { name: 'undo', description: 'Undo last change (deferred in v1)', isBuiltIn: true },
  { name: 'redo', description: 'Redo last change (deferred in v1)', isBuiltIn: true },
  { name: 'compact', description: 'Summarize conversation', isBuiltIn: true },
  { name: 'clear', description: 'Clear local message display', isBuiltIn: true },
]

// ============================================================================
// Session filters & sort — pure UI state. Modes are strings (whatever the
// selected agent's getModes() returns at runtime).
// ============================================================================

export type SortPreset = 'recent' | 'workflow' | 'created' | 'duration' | 'files' | 'alpha'

export type ModeFilter = string

export type StatusFilter = 'running' | 'completed'

export interface SessionFilters {
  modes: Set<ModeFilter>
  statuses: Set<StatusFilter>
  sortPreset: SortPreset
}

export const DEFAULT_SESSION_FILTERS: SessionFilters = {
  modes: new Set(),
  statuses: new Set(),
  sortPreset: 'recent',
}

export interface SerializedSessionFilters {
  modes: ModeFilter[]
  statuses: StatusFilter[]
  sortPreset: SortPreset
}

export function serializeFilters(filters: SessionFilters): SerializedSessionFilters {
  return {
    modes: Array.from(filters.modes),
    statuses: Array.from(filters.statuses),
    sortPreset: filters.sortPreset,
  }
}

export function deserializeFilters(serialized: SerializedSessionFilters): SessionFilters {
  return {
    modes: new Set(serialized.modes),
    statuses: new Set(serialized.statuses),
    sortPreset: serialized.sortPreset,
  }
}

// ============================================================================
// Workflow sort — groups sessions by (mode, running?) for a natural
// plan-first, build-after flow. Unknown modes fall into "other".
// ============================================================================

export const WORKFLOW_PRIORITY: Record<string, number> = {
  'plan-completed': 1,
  'plan-running': 2,
  'build-running': 3,
  'build-completed': 4,
  'other-running': 5,
  'other-completed': 6,
}

export function getWorkflowPriority(mode: string | undefined, isRunning: boolean): number {
  const status = isRunning ? 'running' : 'completed'
  const modeKey = mode === 'plan' || mode === 'build' ? mode : 'other'
  return WORKFLOW_PRIORITY[`${modeKey}-${status}`] ?? 6
}

export const WORKFLOW_GROUP_LABELS: Record<string, string> = {
  'plan-completed': 'Completed Plans',
  'plan-running': 'Active Plans',
  'build-running': 'Active Builds',
  'build-completed': 'Completed Builds',
  'other-running': 'Other Active',
  'other-completed': 'Other Completed',
}

// ============================================================================
// Per-session preferences — what mode/model/thought the user picked for a
// given session. Stored locally in Dexie, keyed by sessionId.
// ============================================================================

export interface SessionPreferences {
  sessionId: string
  hostId: number
  agent?: string
  mode?: string
  model?: string
  thoughtLevel?: string
  inputDraft?: string
  alias?: string
}

// ============================================================================
// Model/agent picker selection persisted per host.
// ============================================================================

export interface HostModelDefault {
  hostId: number
  agent: string
  model: string
}

// ============================================================================
// Message grouping for display. A "group" merges consecutive messages of the
// same role into one visual block (e.g. multiple assistant turns rendering
// continuously). Data comes from the event accumulator.
// ============================================================================

export type MessageRole = 'user' | 'assistant'

export interface MessagePart {
  kind: 'text' | 'thought' | 'tool_call' | 'image'
  id: string
  content: string
  dataUrl?: string
  mimeType?: string
  toolName?: string
  toolStatus?: 'pending' | 'running' | 'complete' | 'error'
  toolOutput?: string
}

export interface Message {
  id: string
  role: MessageRole
  parts: MessagePart[]
  agent?: string
  isStreaming: boolean
  createdAt: number
}

export interface MessageGroup {
  id: string
  role: MessageRole
  messages: Message[]
  agent?: string
  isStreaming: boolean
}

// ============================================================================
// Convenience — not exported from SDK directly, but useful as a shape in
// stores for aggregating session + local preferences.
// ============================================================================

export interface SessionWithPrefs {
  session: SessionRecord
  prefs?: SessionPreferences
}
