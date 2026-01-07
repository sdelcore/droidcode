# Data Models

This document describes the TypeScript types used in DroidCode Expo.

## Domain Models (`types/domain.ts`)

### Agent

```typescript
type AgentType = 'plan' | 'build' | 'shell' | 'general' | 'explore';

interface Agent {
  type: AgentType;
  displayName: string;
  apiName: string;
  description: string;
  isPrimary: boolean;
  icon: string;
}
```

**Primary Agents:**
- `plan` - Plans implementation strategy
- `build` - Implements code changes
- `shell` - Runs shell commands directly

**Subagents:**
- `general` - General-purpose assistant
- `explore` - Codebase exploration

### ThinkingMode

```typescript
type ThinkingModeType = 'normal' | 'high' | 'max';

interface ThinkingMode {
  type: ThinkingModeType;
  displayName: string;
  description: string;
  budgetTokens: number | null;
  variant: 'high' | 'max' | null;
}
```

| Mode | Budget | API Variant |
|------|--------|-------------|
| normal | null | null |
| high | 8,000 | 'high' |
| max | 32,000 | 'max' |

### Host

```typescript
interface Host {
  id: number;
  name: string;
  host: string;
  port: number;
  isSecure: boolean;
  lastConnected?: number;
  createdAt: number;
}
```

Represents a configured OpenCode server.

### Project

```typescript
type ProjectStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown';

interface Project {
  id: number;
  hostId: number;
  parentProjectId?: number;  // Worktree parent
  manifestId?: string;       // For sync
  name: string;
  directory: string;
  port: number;
  pid?: number;
  status: ProjectStatus;
  lastConnected?: number;
  createdAt: number;
}
```

Represents an OpenCode server instance. Root projects run on port 4096, worktrees on 4100-4199.

### SlashCommand

```typescript
interface SlashCommand {
  name: string;
  description: string;
  isBuiltIn: boolean;
}
```

Built-in commands: `/undo`, `/redo`, `/compact`, `/clear`

## API DTOs (`types/api.ts`)

### SessionDto

```typescript
interface SessionDto {
  id: string;
  projectID: string;
  directory: string;
  parentID?: string;
  title: string;
  version: string;
  time: SessionTimeDto;
  summary?: SessionSummaryDto;
  share?: SessionShareDto;
  revert?: SessionRevertDto;
}
```

### MessageDto

```typescript
interface MessageDto {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePartDto[];
  agent?: string;
  timestamp: number;
}

type MessagePartType = 'text' | 'thinking' | 'reasoning' | 'code' | 'tool' | 'file';

interface MessagePartDto {
  type: MessagePartType;
  text?: string;
  language?: string;
  tool?: string;
  toolName?: string;
  state?: ToolStateDto;
  input?: unknown;
  output?: string;
  mime?: string;
  url?: string;
  filename?: string;
}
```

### ToolStateDto

```typescript
type ToolStatus = 'pending' | 'running' | 'completed' | 'failed' | 'error';

interface ToolStateDto {
  status?: ToolStatus;
  input?: unknown;
  output?: string;
  title?: string;
  error?: string;
}
```

### TodoDto

```typescript
type TodoStatus = 'pending' | 'in_progress' | 'completed';

interface TodoDto {
  id: string;
  content: string;
  status: TodoStatus;
  activeForm?: string;
}
```

### FileDiffDto

```typescript
interface FileDiffDto {
  path: string;
  additions: number;
  deletions: number;
}
```

## SSE Events (`types/sse.ts`)

### Event Types

```typescript
type SseEventType =
  | 'message.start'
  | 'message.delta'
  | 'message.complete'
  | 'session.updated'
  | 'session.diff'
  | 'session.status'
  | 'todo.updated'
  | 'permission.requested'
  | 'permission.replied'
  | 'error';
```

### Event Payloads

```typescript
// message.start
interface MessageStartEvent {
  sessionId: string;
  messageId: string;
  role: 'user' | 'assistant';
  agent?: string;
}

// message.delta
interface MessageDeltaEvent {
  sessionId: string;
  messageId: string;
  partId: string;
  partType: MessagePartType;
  content: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  toolStatus?: ToolStatus;
}

// todo.updated
interface TodoUpdatedEvent {
  sessionId: string;
  todos: TodoDto[];
}

// permission.requested
interface PermissionRequestedEvent {
  sessionId: string;
  messageId: string;
  permissionId: string;
  toolType: string;
  title: string;
  metadata?: Record<string, string>;
}
```

## Database Entities

### HostRow (SQLite)

```typescript
interface HostRow {
  id: number;
  name: string;
  host: string;
  port: number;
  is_secure: number;  // 0 or 1
  last_connected: number | null;
  created_at: number;
}
```

### ProjectRow (SQLite)

```typescript
interface ProjectRow {
  id: number;
  host_id: number;
  parent_project_id: number | null;
  manifest_id: string | null;
  name: string;
  directory: string;
  port: number;
  pid: number | null;
  status: string;
  last_connected: number | null;
  created_at: number;
}
```

## Store State Types

### ChatState

```typescript
interface ChatState {
  sessionId: string | null;
  hostId: number | null;
  messages: MessageDto[];
  streamingMessage: MessageDto | null;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  inputText: string;
  selectedAgent: AgentType;
  thinkingMode: ThinkingModeType;
  connectionState: ConnectionState;
  todos: TodoDto[];
  diffs: FileDiffDto[];
  pendingPermission: Permission | null;
  isAssistantTurnActive: boolean;
  isSessionBusy: boolean;
  canRedo: boolean;
}
```

### ProjectState

```typescript
interface ProjectState {
  projects: Project[];
  worktrees: Map<number, Project[]>;
  selectedProjectId: number | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}
```

## Type Conversions

### Row to Domain (Example)

```typescript
function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    hostId: row.host_id,
    parentProjectId: row.parent_project_id ?? undefined,
    manifestId: row.manifest_id ?? undefined,
    name: row.name,
    directory: row.directory,
    port: row.port,
    pid: row.pid ?? undefined,
    status: row.status as ProjectStatus,
    lastConnected: row.last_connected ?? undefined,
    createdAt: row.created_at,
  };
}
```

## Constants

### Port Ranges

- Main host: 4096
- Worktrees: 4100-4199

### Status Colors

```typescript
const PROJECT_STATUS_COLORS = {
  running: '#4CAF50',   // Green
  stopped: '#9E9E9E',   // Grey
  starting: '#FF9800',  // Orange
  stopping: '#FF9800',  // Orange
  error: '#F44336',     // Red
  unknown: '#9E9E9E',   // Grey
};
```
