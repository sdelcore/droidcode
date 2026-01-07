/**
 * MessageAccumulator - Efficient string accumulation for streaming.
 *
 * Avoids O(n²) string concatenation by using array of chunks.
 * Builds final string only when needed (lazy evaluation with caching).
 */

import type { ContentAccumulator } from './types';

export class MessageAccumulator implements ContentAccumulator {
  private _chunks: string[] = [];
  private _totalLength = 0;
  private _cachedResult: string | null = null;

  /**
   * Get the array of chunks (read-only view).
   */
  get chunks(): string[] {
    return this._chunks;
  }

  /**
   * Get total length of all accumulated content.
   */
  get totalLength(): number {
    return this._totalLength;
  }

  /**
   * Append a chunk of content.
   * Invalidates the cached result.
   *
   * @param chunk - The string chunk to append
   */
  append(chunk: string): void {
    // Handle null/undefined gracefully
    if (chunk == null || chunk === '') {
      return;
    }

    this._chunks.push(chunk);
    this._totalLength += chunk.length;
    this._cachedResult = null; // Invalidate cache
  }

  /**
   * Get the full accumulated string.
   * Result is cached until next append.
   */
  toString(): string {
    if (this._cachedResult === null) {
      this._cachedResult = this._chunks.join('');
    }
    return this._cachedResult;
  }

  /**
   * Peek at current content.
   * Returns cached value if available, otherwise builds string.
   */
  peek(): string {
    if (this._cachedResult !== null) {
      return this._cachedResult;
    }
    return this._chunks.join('');
  }

  /**
   * Clear all accumulated content.
   */
  clear(): void {
    this._chunks = [];
    this._totalLength = 0;
    this._cachedResult = null;
  }
}
