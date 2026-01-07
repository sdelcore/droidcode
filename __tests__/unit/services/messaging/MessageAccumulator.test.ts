/**
 * MessageAccumulator Tests
 *
 * Tests for efficient string building during message streaming.
 * Uses array of chunks instead of O(n²) string concatenation.
 */

import { MessageAccumulator } from '@/services/messaging/MessageAccumulator';

describe('MessageAccumulator', () => {
  let accumulator: MessageAccumulator;

  beforeEach(() => {
    accumulator = new MessageAccumulator();
  });

  describe('basic operations', () => {
    it('should return empty string when no chunks', () => {
      expect(accumulator.toString()).toBe('');
    });

    it('should accumulate chunks efficiently', () => {
      accumulator.append('Hello');
      accumulator.append(' ');
      accumulator.append('World');

      expect(accumulator.toString()).toBe('Hello World');
    });

    it('should report correct totalLength', () => {
      accumulator.append('Hello');
      expect(accumulator.totalLength).toBe(5);

      accumulator.append(' World');
      expect(accumulator.totalLength).toBe(11);
    });

    it('should handle empty string appends', () => {
      accumulator.append('Hello');
      accumulator.append('');
      accumulator.append('World');

      expect(accumulator.toString()).toBe('HelloWorld');
      expect(accumulator.totalLength).toBe(10);
    });

    it('should handle null/undefined content gracefully', () => {
      accumulator.append('Hello');
      // @ts-expect-error - testing runtime behavior
      accumulator.append(null);
      // @ts-expect-error - testing runtime behavior
      accumulator.append(undefined);
      accumulator.append('World');

      expect(accumulator.toString()).toBe('HelloWorld');
    });
  });

  describe('caching', () => {
    it('should cache toString result until new append', () => {
      accumulator.append('Hello');

      const result1 = accumulator.toString();
      const result2 = accumulator.toString();

      // Should return same cached result
      expect(result1).toBe(result2);
      expect(result1).toBe('Hello');
    });

    it('should invalidate cache on new append', () => {
      accumulator.append('Hello');
      const result1 = accumulator.toString();

      accumulator.append(' World');
      const result2 = accumulator.toString();

      expect(result1).toBe('Hello');
      expect(result2).toBe('Hello World');
    });
  });

  describe('clear', () => {
    it('should clear all state on clear()', () => {
      accumulator.append('Hello');
      accumulator.append(' World');

      accumulator.clear();

      expect(accumulator.toString()).toBe('');
      expect(accumulator.totalLength).toBe(0);
    });

    it('should allow new appends after clear', () => {
      accumulator.append('Hello');
      accumulator.clear();
      accumulator.append('Goodbye');

      expect(accumulator.toString()).toBe('Goodbye');
    });
  });

  describe('peek', () => {
    it('should return current content without affecting cache', () => {
      accumulator.append('Hello');

      const peeked = accumulator.peek();

      expect(peeked).toBe('Hello');
    });

    it('should return same content as toString', () => {
      accumulator.append('Hello');
      accumulator.append(' World');

      expect(accumulator.peek()).toBe(accumulator.toString());
    });
  });

  describe('performance characteristics', () => {
    it('should handle many small appends efficiently', () => {
      const chunks = 1000;
      const startTime = Date.now();

      for (let i = 0; i < chunks; i++) {
        accumulator.append('x');
      }

      const result = accumulator.toString();
      const endTime = Date.now();

      expect(result.length).toBe(chunks);
      // Should complete in reasonable time (less than 100ms for 1000 chunks)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle large chunks', () => {
      const largeChunk = 'x'.repeat(10000);

      accumulator.append(largeChunk);
      accumulator.append(largeChunk);

      expect(accumulator.totalLength).toBe(20000);
      expect(accumulator.toString().length).toBe(20000);
    });
  });

  describe('chunks access', () => {
    it('should expose chunks array for inspection', () => {
      accumulator.append('Hello');
      accumulator.append(' ');
      accumulator.append('World');

      expect(accumulator.chunks).toEqual(['Hello', ' ', 'World']);
    });

    it('should return empty array when no chunks', () => {
      expect(accumulator.chunks).toEqual([]);
    });
  });
});
