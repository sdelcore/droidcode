/**
 * EventQueue - Backpressure-aware event queue for high-frequency SSE events.
 *
 * Prevents UI thread blocking during rapid delta events by:
 * - Batch processing with frame-aware scheduling
 * - Priority queue for important events (start/complete)
 * - Dropping old low-priority events under backpressure
 */

/**
 * Envelope for SSE events with metadata.
 */
export interface SseEventEnvelope<T = unknown> {
  eventId: string;
  sessionId: string;
  timestamp: number;
  type: string;
  payload: T;
}

interface QueuedEvent {
  envelope: SseEventEnvelope;
  priority: 'high' | 'normal';
  queuedAt: number;
}

export interface EventQueueConfig {
  /** Events to process per batch (default: 10) */
  batchSize?: number;
  /** Delay between batches in ms (default: 16 for ~60fps) */
  batchDelayMs?: number;
  /** Maximum queue size before dropping (default: 1000) */
  maxQueueSize?: number;
}

export interface EventQueueStats {
  queueSize: number;
  droppedCount: number;
  isProcessing: boolean;
}

export class EventQueue {
  private queue: QueuedEvent[] = [];
  private _isProcessing = false;
  private batchSize: number;
  private batchDelayMs: number;
  private maxQueueSize: number;
  private processor: ((event: SseEventEnvelope) => void) | null = null;
  private droppedEventCount = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(config: EventQueueConfig = {}) {
    this.batchSize = config.batchSize ?? 10;
    this.batchDelayMs = config.batchDelayMs ?? 16;
    this.maxQueueSize = config.maxQueueSize ?? 1000;
  }

  /**
   * Set the event processor callback.
   */
  setProcessor(processor: (event: SseEventEnvelope) => void): void {
    this.processor = processor;
  }

  /**
   * Enqueue an event for processing.
   * High-priority events (start, complete) are processed first.
   */
  enqueue(envelope: SseEventEnvelope): void {
    const priority = this.getPriority(envelope.type);

    // Check backpressure before adding
    if (this.queue.length >= this.maxQueueSize) {
      this.dropOldEvents();
    }

    const queuedEvent: QueuedEvent = {
      envelope,
      priority,
      queuedAt: Date.now(),
    };

    // Insert based on priority - high priority goes to front
    if (priority === 'high') {
      // Find first non-high-priority event and insert before it
      const insertIndex = this.queue.findIndex((e) => e.priority !== 'high');
      if (insertIndex === -1) {
        this.queue.push(queuedEvent);
      } else {
        this.queue.splice(insertIndex, 0, queuedEvent);
      }
    } else {
      this.queue.push(queuedEvent);
    }

    this.scheduleProcessing();
  }

  /**
   * Determine priority based on event type.
   */
  private getPriority(eventType: string): 'high' | 'normal' {
    // High priority: start, complete, status, permissions
    if (
      eventType === 'message.start' ||
      eventType === 'message.started' ||
      eventType === 'message.complete' ||
      eventType === 'message.completed' ||
      eventType === 'session.status' ||
      eventType === 'permission.requested' ||
      eventType === 'permission.updated'
    ) {
      return 'high';
    }
    return 'normal';
  }

  /**
   * Drop oldest low-priority events when queue is too large.
   */
  private dropOldEvents(): void {
    // Calculate how many to remove (20% of queue)
    const toRemove = Math.max(1, Math.floor(this.maxQueueSize * 0.2));
    let removed = 0;

    // Remove from end (oldest normal-priority events)
    for (let i = this.queue.length - 1; i >= 0 && removed < toRemove; i--) {
      if (this.queue[i].priority === 'normal') {
        this.queue.splice(i, 1);
        removed++;
        this.droppedEventCount++;
      }
    }
  }

  /**
   * Schedule batch processing if not already scheduled.
   */
  private scheduleProcessing(): void {
    if (this._isProcessing || !this.processor || this.timeoutId !== null) {
      return;
    }

    this._isProcessing = true;
    // Schedule first batch with minimal delay to allow batching
    this.timeoutId = setTimeout(this.processBatch, 0);
  }

  /**
   * Process a batch of events.
   */
  private processBatch = (): void => {
    this.timeoutId = null;

    if (!this.processor || this.queue.length === 0) {
      this._isProcessing = false;
      return;
    }

    // Process up to batchSize events
    const batch = this.queue.splice(0, this.batchSize);

    for (const event of batch) {
      try {
        this.processor(event.envelope);
      } catch (error) {
        console.error('[EventQueue] Processor error:', error);
      }
    }

    // Schedule next batch if more events
    if (this.queue.length > 0) {
      this.timeoutId = setTimeout(this.processBatch, this.batchDelayMs);
    } else {
      this._isProcessing = false;
    }
  };

  /**
   * Clear all queued events and stop processing.
   */
  clear(): void {
    this.queue = [];
    this._isProcessing = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Get queue statistics.
   */
  getStats(): EventQueueStats {
    return {
      queueSize: this.queue.length,
      droppedCount: this.droppedEventCount,
      isProcessing: this._isProcessing,
    };
  }
}
