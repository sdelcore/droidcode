/**
 * Debug log manager for capturing and displaying API logs.
 */

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  tag: string;
  message: string;
  isError: boolean;
}

const MAX_LOG_ENTRIES = 100;

class DebugLogManager {
  private logs: DebugLogEntry[] = [];
  private listeners: Set<(logs: DebugLogEntry[]) => void> = new Set();

  /**
   * Add a log entry.
   */
  log(tag: string, message: string, isError = false) {
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      tag,
      message,
      isError,
    };

    this.logs.unshift(entry);

    // Trim to max entries
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(0, MAX_LOG_ENTRIES);
    }

    this.notifyListeners();
  }

  /**
   * Log an info message.
   */
  info(tag: string, message: string) {
    this.log(tag, message, false);
  }

  /**
   * Log an error message.
   */
  error(tag: string, message: string) {
    this.log(tag, message, true);
  }

  /**
   * Get all logs.
   */
  getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear all logs.
   */
  clear() {
    this.logs = [];
    this.notifyListeners();
  }

  /**
   * Subscribe to log updates.
   */
  subscribe(listener: (logs: DebugLogEntry[]) => void): () => void {
    this.listeners.add(listener);
    // Immediately notify with current logs
    listener(this.getLogs());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const logs = this.getLogs();
    for (const listener of this.listeners) {
      listener(logs);
    }
  }

  /**
   * Format logs for copying to clipboard.
   */
  formatLogsForClipboard(): string {
    return this.logs
      .map((log) => `[${log.timestamp}] ${log.tag}: ${log.message}`)
      .join('\n');
  }
}

export const debugLogManager = new DebugLogManager();
