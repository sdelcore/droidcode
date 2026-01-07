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
