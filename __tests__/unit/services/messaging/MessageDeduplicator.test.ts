/**
 * MessageDeduplicator Tests
 *
 * Tests for tracking processed (messageId, eventType) pairs
 * with TTL-based expiration and max entries limit.
 */

import { MessageDeduplicator } from '@/services/messaging/MessageDeduplicator';

describe('MessageDeduplicator', () => {
  let deduplicator: MessageDeduplicator;

  beforeEach(() => {
    deduplicator = new MessageDeduplicator({
      ttlMs: 1000, // 1 second TTL for testing
      maxEntries: 10,
    });
  });

  afterEach(() => {
    // Clean up any timers
    jest.useRealTimers();
  });

  describe('basic deduplication', () => {
    it('should return false for first occurrence', () => {
      const isDuplicate = deduplicator.isDuplicate('msg-1', 'start');
      expect(isDuplicate).toBe(false);
    });

    it('should return true for duplicate (same messageId + eventType)', () => {
      deduplicator.mark('msg-1', 'start');

      const isDuplicate = deduplicator.isDuplicate('msg-1', 'start');
      expect(isDuplicate).toBe(true);
    });

    it('should allow same messageId with different eventTypes', () => {
      deduplicator.mark('msg-1', 'start');

      const isDuplicateStart = deduplicator.isDuplicate('msg-1', 'start');
      const isDuplicateDelta = deduplicator.isDuplicate('msg-1', 'delta');
      const isDuplicateComplete = deduplicator.isDuplicate('msg-1', 'complete');

      expect(isDuplicateStart).toBe(true);
      expect(isDuplicateDelta).toBe(false);
      expect(isDuplicateComplete).toBe(false);
    });

    it('should track multiple event types for same messageId', () => {
      deduplicator.mark('msg-1', 'start');
      deduplicator.mark('msg-1', 'delta');
      deduplicator.mark('msg-1', 'complete');

      expect(deduplicator.isDuplicate('msg-1', 'start')).toBe(true);
      expect(deduplicator.isDuplicate('msg-1', 'delta')).toBe(true);
      expect(deduplicator.isDuplicate('msg-1', 'complete')).toBe(true);
    });

    it('should handle different messages independently', () => {
      deduplicator.mark('msg-1', 'start');
      deduplicator.mark('msg-2', 'start');

      expect(deduplicator.isDuplicate('msg-1', 'start')).toBe(true);
      expect(deduplicator.isDuplicate('msg-2', 'start')).toBe(true);
      expect(deduplicator.isDuplicate('msg-3', 'start')).toBe(false);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should expire entries after TTL', () => {
      deduplicator.mark('msg-1', 'start');
      expect(deduplicator.isDuplicate('msg-1', 'start')).toBe(true);

      // Advance time past TTL
      jest.advanceTimersByTime(1500);

      // Should no longer be considered duplicate
      expect(deduplicator.isDuplicate('msg-1', 'start')).toBe(false);
    });

    it('should not expire entries before TTL', () => {
      deduplicator.mark('msg-1', 'start');

      // Advance time but not past TTL
      jest.advanceTimersByTime(500);

      expect(deduplicator.isDuplicate('msg-1', 'start')).toBe(true);
    });

    it('should update timestamp when re-marking existing entry', () => {
      deduplicator.mark('msg-1', 'start');

      // Advance time halfway
      jest.advanceTimersByTime(500);

      // Re-mark to refresh timestamp
      deduplicator.mark('msg-1', 'start');

      // Advance another 700ms (total 1200ms from original mark)
      jest.advanceTimersByTime(700);

      // Should still be valid because we refreshed at 500ms
      expect(deduplicator.isDuplicate('msg-1', 'start')).toBe(true);
    });
  });

  describe('max entries limit', () => {
    it('should enforce maxEntries limit', () => {
      // Create deduplicator with small limit
      const smallDedup = new MessageDeduplicator({
        ttlMs: 60000,
        maxEntries: 5,
      });

      // Add more entries than the limit
      for (let i = 0; i < 10; i++) {
        smallDedup.mark(`msg-${i}`, 'start');
      }

      // Should have evicted oldest entries
      expect(smallDedup.size).toBeLessThanOrEqual(5);
    });

    it('should evict oldest entries when at capacity', () => {
      const smallDedup = new MessageDeduplicator({
        ttlMs: 60000,
        maxEntries: 3,
      });

      smallDedup.mark('msg-1', 'start');
      smallDedup.mark('msg-2', 'start');
      smallDedup.mark('msg-3', 'start');
      smallDedup.mark('msg-4', 'start'); // Should evict msg-1

      expect(smallDedup.isDuplicate('msg-1', 'start')).toBe(false);
      expect(smallDedup.isDuplicate('msg-4', 'start')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all entries on clear()', () => {
      deduplicator.mark('msg-1', 'start');
      deduplicator.mark('msg-2', 'start');
      deduplicator.mark('msg-3', 'start');

      deduplicator.clear();

      expect(deduplicator.isDuplicate('msg-1', 'start')).toBe(false);
      expect(deduplicator.isDuplicate('msg-2', 'start')).toBe(false);
      expect(deduplicator.isDuplicate('msg-3', 'start')).toBe(false);
      expect(deduplicator.size).toBe(0);
    });

    it('should allow new entries after clear', () => {
      deduplicator.mark('msg-1', 'start');
      deduplicator.clear();
      deduplicator.mark('msg-1', 'start');

      expect(deduplicator.isDuplicate('msg-1', 'start')).toBe(true);
    });
  });

  describe('size', () => {
    it('should report correct size', () => {
      expect(deduplicator.size).toBe(0);

      deduplicator.mark('msg-1', 'start');
      expect(deduplicator.size).toBe(1);

      deduplicator.mark('msg-2', 'start');
      expect(deduplicator.size).toBe(2);

      // Same message, different event type - same entry
      deduplicator.mark('msg-1', 'delta');
      expect(deduplicator.size).toBe(2);
    });
  });

  describe('has', () => {
    it('should check if message exists without considering eventType', () => {
      deduplicator.mark('msg-1', 'start');

      expect(deduplicator.has('msg-1')).toBe(true);
      expect(deduplicator.has('msg-2')).toBe(false);
    });
  });

  describe('default configuration', () => {
    it('should use default values when not specified', () => {
      const defaultDedup = new MessageDeduplicator();

      // Should work with default config
      defaultDedup.mark('msg-1', 'start');
      expect(defaultDedup.isDuplicate('msg-1', 'start')).toBe(true);
    });
  });
});
