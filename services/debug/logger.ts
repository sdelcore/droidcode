/**
 * Unified logger that outputs to both console and debugLogManager.
 * This ensures logs appear in Metro console and in the Settings debug log viewer.
 */

import { debugLogManager } from './debugLogManager';

// ============================================================================
// Log Level System
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Global log level (can be changed at runtime via setLogLevel)
let currentLogLevel: LogLevel = 'info';

/**
 * Set the global log level. Messages below this level will be filtered out.
 * - 'debug': Show all messages (most verbose)
 * - 'info': Show info, warn, error (default)
 * - 'warn': Show warn, error only
 * - 'error': Show errors only (least verbose)
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Get the current global log level.
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLogLevel];
}

// ============================================================================
// Logger Factory
// ============================================================================

/**
 * Create a tagged logger for a specific component/module.
 *
 * @example
 * const log = createLogger('SSE');
 * log.info('Connected successfully');
 * log.warn('Connection lost, reconnecting...');
 * log.error('Failed to parse event');
 */
export function createLogger(tag: string) {
  return {
    /**
     * Log a debug message. Only shown when log level is 'debug'.
     */
    debug(message: string) {
      if (!shouldLog('debug')) return;
      console.log(`[${tag}] ${message}`);
      debugLogManager.info(tag, message);
    },

    /**
     * Log an info message. Shown at 'debug' and 'info' levels.
     */
    info(message: string) {
      if (!shouldLog('info')) return;
      console.log(`[${tag}] ${message}`);
      debugLogManager.info(tag, message);
    },

    /**
     * Log a warning message. Shown at 'debug', 'info', and 'warn' levels.
     */
    warn(message: string) {
      if (!shouldLog('warn')) return;
      console.warn(`[${tag}] ${message}`);
      debugLogManager.error(tag, message); // Warnings show as errors in debug log for visibility
    },

    /**
     * Log an error message. Always shown (all log levels).
     */
    error(message: string) {
      if (!shouldLog('error')) return;
      console.error(`[${tag}] ${message}`);
      debugLogManager.error(tag, message);
    },
  };
}

// Pre-created loggers for common modules
export const sseLogger = createLogger('SSE');
export const chatLogger = createLogger('Chat');
