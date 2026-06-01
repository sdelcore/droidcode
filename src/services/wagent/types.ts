// Mirror of wagent's v1 wire types (see ~/src/wagent/src/types.ts).
// Stable v1 contract — bumping requires the server to bump too.

export type AgentKind = 'claude' | 'pi' | 'echo'

// Coarse lifecycle state surfaced on Session so list views can colour
// rows without subscribing to SSE. Maintained server-side; clients
// treat it as read-only.
export type SessionStatus =
  | 'idle'
  | 'running'
  | 'needs_input'
  | 'error'
  | 'destroyed'

export interface Session {
  id: string
  agent: AgentKind
  cwd: string
  alias: string | null
  model: string | null
  // Free-form UX label set by clients on POST / PATCH. Adapters ignore
  // it. Common conventions: 'edit' / 'shell' / 'plan' / 'build'.
  mode: string | null
  status: SessionStatus
  createdAt: number
  updatedAt: number
  destroyedAt: number | null
}

export interface ContentBlock {
  type: 'text' | 'image'
  text?: string
  data?: string // base64
  mimeType?: string
}

export type SessionUpdateKind =
  | 'agent_message_chunk'
  | 'agent_thought_chunk'
  | 'tool_call'
  | 'tool_call_update'
  | 'plan'
  | 'user_message_chunk'
  | 'permission_request'
  | 'permission_resolved'
  | 'stop'
  | 'subprocess_died'
  | 'session_destroyed'

export interface SessionUpdate {
  kind: SessionUpdateKind
  // Variant payload — shape depends on kind.
  [key: string]: unknown
}

export interface EventEnvelope {
  sessionId: string
  eventIndex: number
  createdAt: number
  kind: SessionUpdateKind
  payload: SessionUpdate
}

export type PermissionOutcome = 'allow_always' | 'allow_once' | 'reject'

export interface PermissionRequestPayload {
  requestId: string
  toolCall: {
    toolCallId: string
    title?: string
    name?: string
  }
  availableOutcomes: PermissionOutcome[]
}

export interface AgentAvailability {
  id: AgentKind
  installed: boolean
  reason?: 'binary_missing' | 'package_missing' | 'probe_failed'
  version?: string
  notes?: string
}

export interface WagentMeta {
  name: string
  version: string
  hostname: string
  home: string
  capabilities: {
    agents: AgentKind[]
    auth: 'bearer' | 'none'
  }
}

export interface Project {
  directory: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export type FsEntryType = 'directory' | 'file' | 'symlink' | 'unknown'

export interface FsEntry {
  name: string
  path: string
  entryType: FsEntryType
  size?: number
  modified?: string
}

export class WagentError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'WagentError'
    this.status = status
    this.code = code
    this.details = details
  }
}
