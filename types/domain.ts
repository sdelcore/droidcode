/**
 * Domain models for DroidCode.
 * Ported from: domain/model/*.kt
 */

import type { MessageDto } from './api';

// ============================================================================
// Agent
// ============================================================================

export type AgentType = 'plan' | 'build' | 'shell' | 'general' | 'explore';

export interface Agent {
  type: AgentType;
  displayName: string;
  apiName: string;
  description: string;
  isPrimary: boolean;
  icon: string; // MaterialCommunityIcons name
}

export const AGENTS: Record<AgentType, Agent> = {
  plan: {
    type: 'plan',
    displayName: 'Plan',
    apiName: 'plan',
    description: 'Plans implementation strategy',
    isPrimary: true,
    icon: 'file-document-outline',
  },
  build: {
    type: 'build',
    displayName: 'Build',
    apiName: 'build',
    description: 'Implements code changes',
    isPrimary: true,
    icon: 'hammer',
  },
  shell: {
    type: 'shell',
    displayName: 'Shell',
    apiName: 'shell',
    description: 'Runs shell commands',
    isPrimary: true,
    icon: 'console',
  },
  general: {
    type: 'general',
    displayName: 'General',
    apiName: 'general',
    description: 'General purpose assistant',
    isPrimary: false,
    icon: 'robot',
  },
  explore: {
    type: 'explore',
    displayName: 'Explore',
    apiName: 'explore',
    description: 'Explores codebase',
    isPrimary: false,
    icon: 'magnify',
  },
};

// Only show plan and build in the UI picker
export const PRIMARY_AGENTS = [AGENTS.plan, AGENTS.build];
export const ALL_AGENTS = Object.values(AGENTS);

// ============================================================================
// Thinking Mode
// ============================================================================

export type ThinkingModeType = 'normal' | 'high' | 'max';

export interface ThinkingMode {
  type: ThinkingModeType;
  displayName: string;
  description: string;
  budgetTokens: number | null;
  variant: 'high' | 'max' | null; // API variant value
}

export const THINKING_MODES: Record<ThinkingModeType, ThinkingMode> = {
  normal: {
    type: 'normal',
    displayName: 'Normal',
    description: 'Standard thinking',
    budgetTokens: null,
    variant: null,
  },
  high: {
    type: 'high',
    displayName: 'High',
    description: '8K token budget',
    budgetTokens: 8000,
    variant: 'high',
  },
  max: {
    type: 'max',
    displayName: 'Max',
    description: '32K token budget',
    budgetTokens: 32000,
    variant: 'max',
  },
};

// ============================================================================
// Host
// ============================================================================

export interface Host {
  id: number;
  name: string;
  host: string;
  port: number;
  isSecure: boolean;
  lastConnected?: number;
  createdAt: number;
}

// ============================================================================
// Project
// ============================================================================

/**
 * Status of an OpenCode server instance.
 * Ported from: domain/model/Project.kt
 */
export type ProjectStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  running: 'Running',
  stopped: 'Stopped',
  starting: 'Starting...',
  stopping: 'Stopping...',
  error: 'Error',
  unknown: 'Unknown',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  running: '#4CAF50',   // Green
  stopped: '#9E9E9E',   // Grey
  starting: '#FF9800',  // Orange
  stopping: '#FF9800',  // Orange
  error: '#F44336',     // Red
  unknown: '#9E9E9E',   // Grey
};

/**
 * Represents an OpenCode server instance running on a dedicated port.
 * Projects are spawned and managed via shell commands through the main
 * OpenCode instance (port 4096).
 */
export interface Project {
  id: number;
  hostId: number;
  name: string;
  directory: string;
  port: number;
  pid?: number;
  status: ProjectStatus;
  lastConnected?: number;
  createdAt: number;
}

/**
 * Information about a running OpenCode instance discovered via ps command.
 */
export interface DiscoveredProject {
  port: number;
  directory?: string;
  pid: number;
}

// ============================================================================
// Permission
// ============================================================================

export type PermissionResponse = 'accept' | 'accept_always' | 'deny';

export interface Permission {
  id: string;
  sessionId: string;
  messageId: string;
  toolType: string;
  title: string;
  metadata?: Record<string, string>;
  createdAt: number;
}

// ============================================================================
// Question (AI asking user questions)
// ============================================================================

/**
 * A single option for a question.
 */
export interface QuestionOption {
  label: string;        // Display text (1-5 words, concise)
  description: string;  // Explanation of this choice
}

/**
 * A single question with options.
 */
export interface QuestionInfo {
  question: string;     // Complete question text
  header: string;       // Short label (max 12 chars)
  options: QuestionOption[];
  multiple?: boolean;   // Allow selecting multiple choices
}

/**
 * Full question request from the server.
 */
export interface QuestionRequest {
  id: string;           // Question request ID (e.g., "question_xxx")
  sessionId: string;
  questions: QuestionInfo[];
  tool?: {
    messageId: string;
    callId: string;
  };
}

/**
 * Reply payload for answering questions.
 * Each inner array contains the selected label(s) for that question.
 */
export interface QuestionReply {
  answers: string[][];
}

// ============================================================================
// Slash Command
// ============================================================================

export interface SlashCommand {
  name: string;
  description: string;
  isBuiltIn: boolean;
}

export const BUILT_IN_COMMANDS: SlashCommand[] = [
  { name: 'undo', description: 'Undo last change', isBuiltIn: true },
  { name: 'redo', description: 'Redo last change', isBuiltIn: true },
  { name: 'compact', description: 'Compact session history', isBuiltIn: true },
  { name: 'clear', description: 'Clear current session', isBuiltIn: true },
];

// ============================================================================
// Model Selection
// ============================================================================

export interface Model {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
}

// ============================================================================
// Message Grouping (for display)
// ============================================================================

/**
 * Groups consecutive messages of the same role for visual rendering.
 * Used to merge consecutive assistant messages into a single visual block.
 */
export interface MessageGroup {
  id: string;           // First message ID (stable key for FlatList)
  role: 'user' | 'assistant';
  messages: MessageDto[];
  agent?: string;       // Agent name for header (from first message)
  isStreaming: boolean; // True if last message is currently streaming
}

// ============================================================================
// Session Filters & Sorting
// ============================================================================

/**
 * Available sort presets for the session list.
 */
export type SortPreset = 'recent' | 'workflow' | 'created' | 'duration' | 'files' | 'alpha';

/**
 * Available agent filter types.
 */
export type AgentFilter = 'plan' | 'build';

/**
 * Available status filter types.
 */
export type StatusFilter = 'running' | 'completed';

/**
 * Session filter state containing all active filters and sort preferences.
 */
export interface SessionFilters {
  agents: Set<AgentFilter>;
  statuses: Set<StatusFilter>;
  sortPreset: SortPreset;
}

/**
 * Default filter state - no filters active, sorted by recent.
 */
export const DEFAULT_SESSION_FILTERS: SessionFilters = {
  agents: new Set(),
  statuses: new Set(),
  sortPreset: 'recent',
};

/**
 * Serializable version of SessionFilters for persistence.
 */
export interface SerializedSessionFilters {
  agents: AgentFilter[];
  statuses: StatusFilter[];
  sortPreset: SortPreset;
}

/**
 * Convert SessionFilters to a serializable format.
 */
export function serializeFilters(filters: SessionFilters): SerializedSessionFilters {
  return {
    agents: Array.from(filters.agents),
    statuses: Array.from(filters.statuses),
    sortPreset: filters.sortPreset,
  };
}

/**
 * Convert serialized filters back to SessionFilters.
 */
export function deserializeFilters(serialized: SerializedSessionFilters): SessionFilters {
  return {
    agents: new Set(serialized.agents),
    statuses: new Set(serialized.statuses),
    sortPreset: serialized.sortPreset,
  };
}

/**
 * Workflow sort priority - lower number = higher priority.
 * Order: Plan completed -> Plan running -> Build running -> Build completed -> Others
 */
export const WORKFLOW_PRIORITY: Record<string, number> = {
  'plan-completed': 1,
  'plan-running': 2,
  'build-running': 3,
  'build-completed': 4,
  'other-running': 5,
  'other-completed': 6,
};

/**
 * Get workflow priority for a session based on agent and running status.
 */
export function getWorkflowPriority(agent: string | undefined, isRunning: boolean): number {
  const status = isRunning ? 'running' : 'completed';
  const agentKey = agent === 'plan' || agent === 'build' ? agent : 'other';
  const key = `${agentKey}-${status}`;
  return WORKFLOW_PRIORITY[key] ?? 6;
}

/**
 * Labels for workflow groups displayed as section headers.
 */
export const WORKFLOW_GROUP_LABELS: Record<string, string> = {
  'plan-completed': 'Completed Plans',
  'plan-running': 'Active Plans',
  'build-running': 'Active Builds',
  'build-completed': 'Completed Builds',
  'other-running': 'Other Active',
  'other-completed': 'Other Completed',
};
