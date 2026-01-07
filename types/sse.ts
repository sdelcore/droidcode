/**
 * SSE Event types and connection state.
 * Ported from: data/remote/sse/SseEvent.kt
 */

import { FileDiffDto, TodoDto, ToolStatus, SessionDto } from './api';

// ============================================================================
// SSE Event Types (Sealed class equivalent)
// ============================================================================

export type SseEvent =
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageCompleteEvent
  | SessionUpdateEvent
  | ErrorEvent
  | UnknownEvent
  | TodoUpdatedEvent
  | PermissionRequestedEvent
  | PermissionRepliedEvent
  | SessionDiffEvent
  | SessionStatusEvent
  | SessionCreatedEvent
  | SessionUpdatedGlobalEvent
  | SessionDeletedEvent
  // Server lifecycle events
  | ServerHeartbeatEvent
  | ServerConnectedEvent
  // File system events
  | FileWatcherUpdatedEvent
  | FileEditedEvent
  // LSP events
  | LspDiagnosticsEvent
  | LspUpdatedEvent
  // Additional session events
  | SessionCompactedEvent
  | SessionErrorEvent
  | SessionIdleEvent
  // Installation events
  | InstallationUpdatedEvent
  // Message removal events
  | MessageRemovedEvent
  | MessagePartRemovedEvent
  // Tool execution events
  | ToolExecuteBeforeEvent
  | ToolExecuteAfterEvent
  // Command events
  | CommandExecutedEvent;

export interface MessageStartEvent {
  type: 'message.start';
  sessionId: string;
  messageId: string;
  role: 'user' | 'assistant';
  agent?: string;
}

export interface MessageDeltaEvent {
  type: 'message.delta';
  sessionId: string;
  messageId: string;
  partId: string;
  partType: string;
  content: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  toolStatus?: ToolStatus;
}

export interface MessageCompleteEvent {
  type: 'message.complete';
  sessionId: string;
  messageId: string;
}

export interface SessionUpdateEvent {
  type: 'session.updated';
  sessionId: string;
  title?: string;
}

export interface ErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export interface UnknownEvent {
  type: 'unknown';
  eventType: string;
  rawData: string;
}

export interface TodoUpdatedEvent {
  type: 'todo.updated';
  sessionId: string;
  todos: TodoDto[];
}

export interface PermissionRequestedEvent {
  type: 'permission.requested';
  sessionId: string;
  messageId: string;
  permissionId: string;
  toolType: string;
  title: string;
  metadata?: Record<string, string>;
}

export interface PermissionRepliedEvent {
  type: 'permission.replied';
  sessionId: string;
  permissionId: string;
  response: string;
}

export interface SessionDiffEvent {
  type: 'session.diff';
  sessionId: string;
  files: FileDiffDto[];
}

export interface SessionStatusEvent {
  type: 'session.status';
  sessionId: string;
  status: 'busy' | 'idle';
}

// Global SSE events from /global/event endpoint
export interface SessionCreatedEvent {
  type: 'session.created';
  info: SessionDto;
}

export interface SessionUpdatedGlobalEvent {
  type: 'session.updated.global';
  info: SessionDto;
}

export interface SessionDeletedEvent {
  type: 'session.deleted';
  info: SessionDto;
}

// Server lifecycle events
export interface ServerHeartbeatEvent {
  type: 'server.heartbeat';
}

export interface ServerConnectedEvent {
  type: 'server.connected';
}

// File system events
export interface FileWatcherUpdatedEvent {
  type: 'file.watcher.updated';
  path?: string;
}

export interface FileEditedEvent {
  type: 'file.edited';
  path?: string;
}

// LSP events
export interface LspDiagnosticsEvent {
  type: 'lsp.client.diagnostics';
  diagnostics?: unknown;
}

export interface LspUpdatedEvent {
  type: 'lsp.updated';
}

// Additional session events
export interface SessionCompactedEvent {
  type: 'session.compacted';
  sessionId: string;
}

export interface SessionErrorEvent {
  type: 'session.error';
  sessionId: string;
  error: string;
}

export interface SessionIdleEvent {
  type: 'session.idle';
  sessionId: string;
}

// Installation events
export interface InstallationUpdatedEvent {
  type: 'installation.updated';
}

// Message removal events
export interface MessageRemovedEvent {
  type: 'message.removed';
  sessionId?: string;
  messageId?: string;
}

export interface MessagePartRemovedEvent {
  type: 'message.part.removed';
  sessionId?: string;
  partId?: string;
}

// Tool execution events
export interface ToolExecuteBeforeEvent {
  type: 'tool.execute.before';
  sessionId?: string;
  toolName?: string;
}

export interface ToolExecuteAfterEvent {
  type: 'tool.execute.after';
  sessionId?: string;
  toolName?: string;
}

// Command events
export interface CommandExecutedEvent {
  type: 'command.executed';
  sessionId?: string;
  command?: string;
}

// ============================================================================
// Connection State
// ============================================================================

export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected' }
  | { status: 'error'; message: string }
  | { status: 'reconnecting' };

// ============================================================================
// Internal parsing DTOs (for nested API format)
// ============================================================================

export interface MessagePartUpdatedData {
  properties: {
    part: PartData;
    delta?: string;
  };
}

export interface PartData {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  toolName?: string;
  input?: string;
  output?: string;
  time?: { start?: number; end?: number };
  tool?: string;
  state?: {
    status?: string;
    input?: unknown;
    output?: string;
    title?: string;
    error?: string;
  };
}

export interface MessageUpdatedData {
  properties: {
    info: MessageInfoData;
  };
}

export interface MessageInfoData {
  id: string;
  sessionID: string;
  role: string;
  time?: { created: number; completed?: number };
  finish?: string;
  agent?: string;
}

export interface SessionUpdatedData {
  properties: {
    info: { id: string; title?: string };
  };
}

export interface SessionDiffEventData {
  properties: {
    sessionID: string;
    diff: FileDiffDto[];
  };
}

export interface ErrorEventData {
  properties?: { code: string; message: string };
  code?: string;
  message?: string;
}

export interface TodoUpdatedEventData {
  properties: {
    sessionID: string;
    todos: TodoDto[];
  };
}

export interface MessageStartedData {
  properties: {
    info: MessageInfoData;
  };
}

// Flat format DTOs
export interface MessageDeltaData {
  sessionId: string;
  messageId: string;
  partIndex: number;
  partType: string;
  content: string;
  toolName?: string;
  input?: string;
  output?: string;
}

export interface MessageCompleteData {
  sessionId: string;
  messageId: string;
}

export interface SessionStatusEventData {
  properties: {
    sessionID: string;
    status: { type: string };
  };
}

export interface MessageStartFlatData {
  sessionId: string;
  messageId: string;
  role: string;
  agent?: string;
}

export interface SessionUpdateFlatData {
  sessionId: string;
  title?: string;
}

export interface PermissionUpdatedEventData {
  properties: {
    id: string;
    type: string;
    pattern?: unknown;
    sessionID: string;
    messageID: string;
    callID?: string;
    title: string;
    metadata?: Record<string, string>;
    time?: { created?: number };
  };
}

export interface PermissionRepliedEventData {
  properties: {
    sessionID: string;
    permissionID: string;
    response: string;
  };
}
