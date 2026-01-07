/**
 * Message service types.
 *
 * Types for efficient message streaming and processing.
 */

/**
 * Interface for efficient string accumulation.
 * Avoids O(n²) string concatenation by using array of chunks.
 */
export interface ContentAccumulator {
  /** The array of chunks accumulated so far */
  readonly chunks: string[];
  /** Total length of all accumulated content */
  readonly totalLength: number;
  /** Append a chunk of content */
  append(chunk: string): void;
  /** Get the full accumulated string */
  toString(): string;
  /** Peek at current content without affecting cache */
  peek(): string;
  /** Clear all accumulated content */
  clear(): void;
}

/**
 * Tool part state during streaming.
 */
export interface ToolPartState {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: string;
  output?: string;
}

/**
 * Streaming context for a single message part.
 */
export interface StreamingPartContext {
  partId: string;
  partType: string;
  content: ContentAccumulator;
  toolState?: ToolPartState;
  sequence: number;
}

/**
 * Streaming context for a message being received.
 */
export interface StreamingMessageContext {
  messageId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  agent?: string;
  startedAt: number;
  parts: Map<string, StreamingPartContext>;
  partOrder: string[];
}

/**
 * Deduplication entry with TTL.
 */
export interface DeduplicationEntry {
  messageId: string;
  processedAt: number;
  eventTypes: Set<string>;
}
