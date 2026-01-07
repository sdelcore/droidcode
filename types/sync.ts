/**
 * Type definitions for project synchronization.
 *
 * This module defines the schema for ~/.opencode/droidcode.json which serves
 * as the source of truth for project-to-port mappings across multiple devices.
 */

import type { Project } from './domain';

// ============================================================================
// Constants
// ============================================================================

/** Schema version for config file migrations */
export const CONFIG_SCHEMA_VERSION = 1;

/** Path to the config file on the server */
export const CONFIG_PATH = '$HOME/.opencode/droidcode.json';

// ============================================================================
// Server Config Types
// ============================================================================

/**
 * Single project entry in the server config file.
 * Keyed by directory path for uniqueness.
 */
export interface SyncedProjectConfig {
  /** Unique identifier derived from directory path hash */
  id: string;
  /** Human-readable project name */
  name: string;
  /** Absolute path to project directory on the server */
  directory: string;
  /** Assigned port (4100-4199 range) */
  port: number;
  /** When this entry was created (Unix timestamp ms) */
  createdAt: number;
  /** When this entry was last modified (Unix timestamp ms) */
  updatedAt: number;
  /** Device identifier that last modified this entry */
  lastModifiedBy?: string;
}

/**
 * Root structure of ~/.opencode/droidcode.json
 */
export interface DroidCodeServerConfig {
  /** Schema version for future migrations */
  version: number;
  /** Last sync timestamp (Unix timestamp ms) */
  lastSyncAt: number;
  /** Map of directory path -> project config */
  projects: Record<string, SyncedProjectConfig>;
}

// ============================================================================
// Sync Operation Types
// ============================================================================

/**
 * Result of a sync operation between local DB and server config.
 */
export interface SyncResult {
  /** Whether the sync completed successfully */
  success: boolean;
  /** Projects synced from the server config */
  syncedProjects: SyncedProjectConfig[];
  /** Projects that existed locally but not in server config */
  localOnlyProjects: Project[];
  /** Any errors encountered during sync */
  errors: string[];
  /** Whether the server config was newly created */
  configCreated: boolean;
}

/**
 * Error codes for sync operations.
 */
export enum SyncErrorCode {
  /** Config file does not exist */
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  /** Config file is malformed JSON or invalid schema */
  CONFIG_MALFORMED = 'CONFIG_MALFORMED',
  /** Cannot write to config file (permission denied) */
  WRITE_PERMISSION_DENIED = 'WRITE_PERMISSION_DENIED',
  /** Shell command timed out */
  SHELL_TIMEOUT = 'SHELL_TIMEOUT',
  /** Manager session is invalid or expired */
  SESSION_INVALID = 'SESSION_INVALID',
  /** Network/connection error */
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * Custom error class for sync operations.
 */
export class SyncError extends Error {
  constructor(
    message: string,
    public readonly code: SyncErrorCode,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    this.name = 'SyncError';
  }
}
