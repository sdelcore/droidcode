/**
 * MessageDeduplicator - Tracks processed (messageId, eventType) pairs.
 *
 * Uses TTL-based expiration and max entries limit to prevent memory growth.
 */

export interface MessageDeduplicatorConfig {
  /** Time-to-live in milliseconds (default: 60000) */
  ttlMs?: number;
  /** Maximum number of entries (default: 500) */
  maxEntries?: number;
}

interface DeduplicationEntry {
  messageId: string;
  processedAt: number;
  eventTypes: Set<string>;
}

export class MessageDeduplicator {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private entries: Map<string, DeduplicationEntry> = new Map();

  constructor(config: MessageDeduplicatorConfig = {}) {
    this.ttlMs = config.ttlMs ?? 60000;
    this.maxEntries = config.maxEntries ?? 500;
  }

  /**
   * Get the number of tracked messages.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Check if a (messageId, eventType) pair has been processed.
   * Does NOT mark it - use mark() to mark as processed.
   *
   * @param messageId - The message ID
   * @param eventType - The event type (start, delta, complete, etc.)
   * @returns true if this pair has been processed and not expired
   */
  isDuplicate(messageId: string, eventType: string): boolean {
    const entry = this.entries.get(messageId);

    if (!entry) {
      return false;
    }

    // Check TTL expiration
    const now = Date.now();
    if (now - entry.processedAt > this.ttlMs) {
      // Entry expired, remove it
      this.entries.delete(messageId);
      return false;
    }

    return entry.eventTypes.has(eventType);
  }

  /**
   * Mark a (messageId, eventType) pair as processed.
   *
   * @param messageId - The message ID
   * @param eventType - The event type
   */
  mark(messageId: string, eventType: string): void {
    // Enforce max entries before adding
    this.enforceMaxEntries();

    const now = Date.now();
    let entry = this.entries.get(messageId);

    if (entry) {
      // Update existing entry
      entry.eventTypes.add(eventType);
      entry.processedAt = now; // Refresh timestamp
    } else {
      // Create new entry
      entry = {
        messageId,
        processedAt: now,
        eventTypes: new Set([eventType]),
      };
      this.entries.set(messageId, entry);
    }
  }

  /**
   * Check if a message exists (regardless of event type).
   *
   * @param messageId - The message ID
   * @returns true if the message exists and not expired
   */
  has(messageId: string): boolean {
    const entry = this.entries.get(messageId);

    if (!entry) {
      return false;
    }

    // Check TTL expiration
    const now = Date.now();
    if (now - entry.processedAt > this.ttlMs) {
      this.entries.delete(messageId);
      return false;
    }

    return true;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Enforce max entries limit by evicting oldest entries.
   */
  private enforceMaxEntries(): void {
    if (this.entries.size < this.maxEntries) {
      return;
    }

    // Find and remove oldest entries
    // Since Map maintains insertion order, we can just remove from the beginning
    const entriesToRemove = this.entries.size - this.maxEntries + 1;
    const keys = this.entries.keys();

    for (let i = 0; i < entriesToRemove; i++) {
      const key = keys.next().value;
      if (key) {
        this.entries.delete(key);
      }
    }
  }
}
