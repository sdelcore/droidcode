/**
 * API DTOs for OpenCode server communication.
 * Ported from: data/remote/api/dto/ApiDtos.kt
 *
 * @see https://opencode.ai/docs/server - Official OpenCode Server API documentation.
 *      Refer to the official docs for authoritative type definitions and API changes.
 */

// ============================================================================
// Session DTOs
// ============================================================================

export interface SessionDto {
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

export interface SessionTimeDto {
  created: number;
  updated: number;
  compacting?: number;
}

export interface SessionSummaryDto {
  additions: number;
  deletions: number;
  files: number;
}

export interface SessionShareDto {
  url: string;
}

export interface SessionRevertDto {
  messageID: string;
  partID?: string;
  snapshot?: string;
  diff?: string;
}

// ============================================================================
// Message DTOs
// ============================================================================

export interface MessageDto {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePartDto[];
  agent?: string;
  timestamp: number;
}

export type MessagePartType = 'text' | 'thinking' | 'reasoning' | 'code' | 'tool' | 'file';

export interface MessagePartDto {
  type: MessagePartType;
  text?: string;
  language?: string;
  // Legacy tool field
  toolName?: string;
  // New OpenCode tool fields (type: "tool")
  tool?: string;
  state?: ToolStateDto;
  // Tool input/output (can be at top level or in state)
  input?: unknown;
  output?: string;
  // File/image part fields
  mime?: string;
  url?: string;
  filename?: string;
}

export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed' | 'error';

export interface ToolStateDto {
  status?: ToolStatus;
  input?: unknown;
  output?: string;
  title?: string;
  error?: string;
}

// ============================================================================
// Message Request/Response DTOs
// ============================================================================

export interface TextPartInputDto {
  type: 'text';
  text: string;
}

export interface FilePartInputDto {
  type: 'file';
  mime: string;
  url: string;
  filename?: string;
}

export type MessagePartInput = TextPartInputDto | FilePartInputDto;

export interface MessageResponseDto {
  info: MessageInfoDto;
  parts: MessagePartDto[];
}

export interface MessageInfoDto {
  id: string;
  role: string;
  time?: MessageTimeDto;
  agent?: string;
}

export interface MessageTimeDto {
  created: number;
}

export interface ModelDto {
  providerID: string;
  modelID: string;
}

export interface SendMessageRequest {
  parts: MessagePartInput[];
  agent?: string;
  model?: ModelDto;
  variant?: 'high' | 'max' | null;
}

// ============================================================================
// Health & Error DTOs
// ============================================================================

export interface HealthResponse {
  healthy: boolean;
  version: string;
}

export interface ShareResponse {
  url: string;
}

export interface ErrorResponse {
  error: ErrorDetail;
}

export interface ErrorDetail {
  code: string;
  message: string;
}

// ============================================================================
// Agent DTOs
// ============================================================================

export interface AgentDto {
  name: string;
  description?: string;
  is_primary: boolean;
}

// ============================================================================
// Session Management DTOs
// ============================================================================

export interface ShellRequest {
  command: string;
  agent?: string;
}

export interface RevertRequest {
  messageID: string;
}

export interface RevertResponse {
  success: boolean;
}

export interface ForkRequest {
  messageID: string;
}

export interface ForkResponse {
  sessionId: string;
}

// ============================================================================
// File/Directory DTOs
// ============================================================================

export interface FileNodeDto {
  name: string;
  type: 'file' | 'directory';
  path: string;
  absolute: string;
}

// ============================================================================
// Todo DTOs
// ============================================================================

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoDto {
  id: string;
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

export interface TodoListResponse {
  todos: TodoDto[];
}

// ============================================================================
// Question DTOs (AI asking user questions)
// ============================================================================

export interface QuestionOptionDto {
  label: string;
  description: string;
}

export interface QuestionInfoDto {
  question: string;
  header: string;
  options: QuestionOptionDto[];
  multiple?: boolean;
}

export interface QuestionRequestDto {
  id: string;
  sessionID: string;
  questions: QuestionInfoDto[];
  tool?: {
    messageID: string;
    callID: string;
  };
}

export interface QuestionReplyRequest {
  answers: string[][];
}

// ============================================================================
// File Diff DTOs
// ============================================================================

export interface FileDiffDto {
  path: string;
  additions: number;
  deletions: number;
}

export interface SessionDiffResponse {
  files: FileDiffDto[];
}

// ============================================================================
// Provider/Model DTOs
// ============================================================================

export interface ModelInfoDto {
  id: string;
  name: string;
  provider?: string;
  // Additional model fields from OpenCode API
  limit?: {
    context?: number;
    output?: number;
  };
}

export interface ProviderDto {
  id: string;
  name: string;
  source?: string;
  env?: string[];
  models: Record<string, ModelInfoDto>;  // Models is a Record, not array
}

export interface ProviderStatusDto {
  id: string;
  name: string;
  connected: boolean;
  error?: string;
}

export interface ConfigProvidersResponse {
  providers: ProviderDto[];
  default?: Record<string, string>;  // Maps provider ID to default model ID
}

export interface ProviderListResponse {
  all: ProviderDto[];
  default: Record<string, string>;  // Maps provider ID to default model ID
  connected: string[];  // Array of connected provider IDs
}

// ============================================================================
// Session Update DTOs
// ============================================================================

export interface SessionUpdateRequest {
  title?: string;
}

export interface SessionStatusDto {
  sessionID: string;
  status: {
    type: 'busy' | 'idle';
  };
}
