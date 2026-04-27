# Data Models

Two layers of types live in the codebase:

* **wagent wire types** (`src/services/wagent/types.ts`) — re-exports +
  re-types from the v1 contract. Mirror of the wagent repo's
  `src/types.ts`. Don't modify them locally; if the wire shape needs to
  change, change wagent and bump.
* **domain types** (`src/types/domain.ts`) — purely client-side state
  (filters, preferences, message-rendering shape).

This file documents both. Source of truth is the code; this is a
human-readable index.

## Wire types (from wagent v1)

### `AgentKind`

```ts
type AgentKind = 'claude' | 'pi' | 'echo'
```

### `Session`

```ts
interface Session {
  id: string
  agent: AgentKind
  cwd: string
  alias: string | null
  model: string | null
  createdAt: number
  updatedAt: number
  destroyedAt: number | null
}
```

### `ContentBlock`

```ts
interface ContentBlock {
  type: 'text' | 'image'
  text?: string
  data?: string      // base64
  mimeType?: string
}
```

### `EventEnvelope` + `SessionUpdate`

```ts
interface EventEnvelope {
  sessionId: string
  eventIndex: number
  createdAt: number
  kind: SessionUpdateKind
  payload: SessionUpdate
}

type SessionUpdateKind =
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
```

`payload.kind` mirrors the envelope's `kind`. The rest of the payload
varies — see wagent's `docs/architecture.md` for the per-kind shape.

### `PermissionOutcome`

```ts
type PermissionOutcome = 'allow_always' | 'allow_once' | 'reject'
```

### `ApiError`

```ts
interface ApiError {
  error: { code: string; message: string; details?: unknown }
}
```

The client throws `WagentError(status, code, message, details)` for
every non-2xx; `formatError` in `services/errors/` turns it into toast
text.

## Domain types (`src/types/domain.ts`)

### `Host`

```ts
interface Host {
  id: number
  name: string
  host: string
  port: number
  isSecure: boolean
  token?: string         // Bearer token, sent as Authorization header
  lastConnected?: number
  createdAt: number
  // legacy — left on the type so old Dexie rows decode cleanly:
  companionUrl?: string
  companionToken?: string
}
```

### `ProjectFolder`

```ts
interface ProjectFolder {
  id: number
  hostId: number
  name: string
  directory: string      // absolute path
  lastUsed?: number
  createdAt: number
}
```

Local mirror used by the folder picker. wagent has its own
`/v1/projects` endpoint with similar semantics; the two are kept in
sync per host.

### Filters

```ts
type SortPreset = 'recent' | 'workflow' | 'created' | 'duration' | 'files' | 'alpha'
type StatusFilter = 'running' | 'completed'

interface SessionFilters {
  modes: Set<string>
  statuses: Set<StatusFilter>
  sortPreset: SortPreset
}
```

`modes` are agent-specific (whatever string the agent surfaces) and
serialize into the URL via `serializeFilters` /
`deserializeFilters`. `workflow` sort groups sessions by mode +
running-state (`WORKFLOW_PRIORITY` table).

### `SessionPreferences` (Dexie)

```ts
interface SessionPreferences {
  sessionId: string
  hostId: number
  agent?: string
  mode?: string
  model?: string
  thoughtLevel?: string
  inputDraft?: string
  alias?: string
}
```

Per-browser. Wagent owns the canonical alias + model on the session row;
this table caches the user's input draft and last-picked thought level.

### `HostModelDefault` (Dexie)

```ts
interface HostModelDefault {
  hostId: number
  agent: string
  model: string
}
```

Last model picked per (host, agent). Used to seed `NewSessionDialog`.

### Messages (rendering)

```ts
type MessageRole = 'user' | 'assistant'

interface MessagePart {
  kind: 'text' | 'thought' | 'tool_call' | 'image'
  id: string
  content: string
  dataUrl?: string
  mimeType?: string
  toolName?: string
  toolStatus?: 'pending' | 'running' | 'complete' | 'error'
  toolOutput?: string
}

interface Message {
  id: string
  role: MessageRole
  parts: MessagePart[]
  agent?: string
  isStreaming: boolean
  createdAt: number
}
```

Built by `MessageAccumulator.push(event)`. Each `user_message_chunk`
opens a new turn — the next `agent_message_chunk` starts a fresh
assistant `Message`.

`MessageGroup` merges consecutive messages of the same role for the
list renderer.

## Dexie schema

```
hosts                  Host
projects               ProjectFolder
sessionPreferences     SessionPreferences (PK: sessionId)
hostModelDefaults      HostModelDefault   (compound PK: [hostId, agent])
```

Migrations live in `src/services/db/`. wagent state (sessions, events,
projects on the daemon side) is *not* mirrored here — those queries hit
wagent directly.
