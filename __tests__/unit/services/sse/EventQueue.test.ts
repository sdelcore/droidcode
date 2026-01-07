/**
 * EventQueue Tests
 *
 * Tests for backpressure-aware event queue for high-frequency SSE events.
 */

import { EventQueue, SseEventEnvelope } from '@/services/sse/EventQueue';

// Helper to create event envelopes
function createEnvelope(
  type: string,
  sessionId = 'session-1'
): SseEventEnvelope {
  return {
    eventId: `event-${Date.now()}-${Math.random()}`,
    sessionId,
    timestamp: Date.now(),
    type,
    payload: {},
  };
}

// Helper to wait for async processing
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('EventQueue', () => {
  let queue: EventQueue;
  let processedEvents: SseEventEnvelope[];
  let processor: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    processedEvents = [];
    processor = jest.fn((event: SseEventEnvelope) => {
      processedEvents.push(event);
    });
    queue = new EventQueue({
      batchSize: 5,
      batchDelayMs: 16,
      maxQueueSize: 100,
    });
    queue.setProcessor(processor);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('priority handling', () => {
    it('should process high-priority events (start/complete) first', () => {
      // Enqueue normal priority first
      queue.enqueue(createEnvelope('message.delta'));
      queue.enqueue(createEnvelope('message.delta'));

      // Then high priority
      queue.enqueue(createEnvelope('message.start'));
      queue.enqueue(createEnvelope('message.complete'));

      // Process first batch
      jest.advanceTimersByTime(16);

      // High priority events should be processed first
      expect(processedEvents[0].type).toBe('message.start');
      expect(processedEvents[1].type).toBe('message.complete');
    });

    it('should classify message.start as high priority', () => {
      queue.enqueue(createEnvelope('todo.updated'));
      queue.enqueue(createEnvelope('message.start'));

      jest.advanceTimersByTime(16);

      expect(processedEvents[0].type).toBe('message.start');
    });

    it('should classify message.delta as normal priority', () => {
      queue.enqueue(createEnvelope('message.start'));
      queue.enqueue(createEnvelope('message.delta'));
      queue.enqueue(createEnvelope('message.complete'));

      jest.advanceTimersByTime(16);

      // start and complete before delta
      expect(processedEvents[0].type).toBe('message.start');
      expect(processedEvents[1].type).toBe('message.complete');
      expect(processedEvents[2].type).toBe('message.delta');
    });

    it('should classify permission.requested as high priority', () => {
      queue.enqueue(createEnvelope('message.delta'));
      queue.enqueue(createEnvelope('permission.requested'));

      jest.advanceTimersByTime(16);

      expect(processedEvents[0].type).toBe('permission.requested');
    });

    it('should classify session.status as high priority', () => {
      queue.enqueue(createEnvelope('message.delta'));
      queue.enqueue(createEnvelope('session.status'));

      jest.advanceTimersByTime(16);

      expect(processedEvents[0].type).toBe('session.status');
    });
  });

  describe('backpressure', () => {
    beforeEach(() => {
      // Use smaller max for testing
      queue = new EventQueue({
        batchSize: 5,
        batchDelayMs: 16,
        maxQueueSize: 10,
      });
      queue.setProcessor(processor);
    });

    it('should drop oldest normal-priority events when over maxQueueSize', () => {
      // Fill queue with normal priority events
      for (let i = 0; i < 15; i++) {
        queue.enqueue(createEnvelope('message.delta'));
      }

      // Queue size should be limited
      expect(queue.getStats().queueSize).toBeLessThanOrEqual(10);
      expect(queue.getStats().droppedCount).toBeGreaterThan(0);
    });

    it('should never drop high-priority events', () => {
      // Fill queue to near capacity
      for (let i = 0; i < 8; i++) {
        queue.enqueue(createEnvelope('message.delta'));
      }

      // Add high priority events
      queue.enqueue(createEnvelope('message.start'));
      queue.enqueue(createEnvelope('message.complete'));
      queue.enqueue(createEnvelope('message.delta')); // This triggers overflow

      // Process all
      jest.advanceTimersByTime(100);

      // High priority events should all be processed
      const startEvents = processedEvents.filter((e) => e.type === 'message.start');
      const completeEvents = processedEvents.filter((e) => e.type === 'message.complete');

      expect(startEvents.length).toBe(1);
      expect(completeEvents.length).toBe(1);
    });

    it('should track droppedEventCount', () => {
      for (let i = 0; i < 20; i++) {
        queue.enqueue(createEnvelope('message.delta'));
      }

      expect(queue.getStats().droppedCount).toBeGreaterThan(0);
    });
  });

  describe('batch processing', () => {
    it('should process events in batches', () => {
      // Add more events than batch size
      for (let i = 0; i < 12; i++) {
        queue.enqueue(createEnvelope('message.delta'));
      }

      // First batch fires at 0ms (setTimeout(0))
      jest.advanceTimersByTime(0);
      expect(processedEvents.length).toBe(5); // batchSize

      // Second batch fires at batchDelayMs (16ms)
      jest.advanceTimersByTime(16);
      expect(processedEvents.length).toBe(10);

      // Third batch
      jest.advanceTimersByTime(16);
      expect(processedEvents.length).toBe(12);
    });

    it('should yield to UI thread between batches', () => {
      for (let i = 0; i < 10; i++) {
        queue.enqueue(createEnvelope('message.delta'));
      }

      // Advance by small amount - should process first batch
      jest.advanceTimersByTime(1);
      expect(processedEvents.length).toBe(5);

      // Not yet next batch
      expect(processedEvents.length).toBe(5);

      // After delay, next batch
      jest.advanceTimersByTime(16);
      expect(processedEvents.length).toBe(10);
    });

    it('should call processor for each event', () => {
      queue.enqueue(createEnvelope('message.start'));
      queue.enqueue(createEnvelope('message.delta'));
      queue.enqueue(createEnvelope('message.complete'));

      jest.advanceTimersByTime(16);

      expect(processor).toHaveBeenCalledTimes(3);
    });

    it('should continue processing after processor error', () => {
      let callCount = 0;
      const errorProcessor = jest.fn((event: SseEventEnvelope) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Test error');
        }
        processedEvents.push(event);
      });

      queue.setProcessor(errorProcessor);

      queue.enqueue(createEnvelope('message.start'));
      queue.enqueue(createEnvelope('message.delta')); // This will throw
      queue.enqueue(createEnvelope('message.complete'));

      jest.advanceTimersByTime(16);

      // Should still process 3 events
      expect(errorProcessor).toHaveBeenCalledTimes(3);
      // But only 2 made it to processedEvents
      expect(processedEvents.length).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should clear queue on clear()', () => {
      queue.enqueue(createEnvelope('message.delta'));
      queue.enqueue(createEnvelope('message.delta'));
      queue.enqueue(createEnvelope('message.delta'));

      queue.clear();

      expect(queue.getStats().queueSize).toBe(0);
    });

    it('should stop processing on clear()', () => {
      for (let i = 0; i < 10; i++) {
        queue.enqueue(createEnvelope('message.delta'));
      }

      // Process first batch
      jest.advanceTimersByTime(1);
      expect(processedEvents.length).toBe(5);

      // Clear mid-processing
      queue.clear();

      // Advance time - should not process more
      jest.advanceTimersByTime(100);
      expect(processedEvents.length).toBe(5);
    });

    it('should allow new events after clear', () => {
      queue.enqueue(createEnvelope('message.delta'));
      queue.clear();
      queue.enqueue(createEnvelope('message.start'));

      jest.advanceTimersByTime(16);

      expect(processedEvents.length).toBe(1);
      expect(processedEvents[0].type).toBe('message.start');
    });
  });

  describe('statistics', () => {
    it('should report correct queueSize', () => {
      expect(queue.getStats().queueSize).toBe(0);

      queue.enqueue(createEnvelope('message.delta'));
      queue.enqueue(createEnvelope('message.delta'));

      expect(queue.getStats().queueSize).toBe(2);
    });

    it('should report isProcessing status', () => {
      expect(queue.getStats().isProcessing).toBe(false);

      queue.enqueue(createEnvelope('message.delta'));

      // Processing should start
      expect(queue.getStats().isProcessing).toBe(true);

      // After processing completes
      jest.advanceTimersByTime(16);
      expect(queue.getStats().isProcessing).toBe(false);
    });
  });

  describe('no processor', () => {
    it('should not throw when no processor set', () => {
      const noProcessorQueue = new EventQueue();

      expect(() => {
        noProcessorQueue.enqueue(createEnvelope('message.delta'));
      }).not.toThrow();
    });

    it('should process events when processor is set later', () => {
      const lateQueue = new EventQueue();
      lateQueue.enqueue(createEnvelope('message.delta'));

      const lateProcessor = jest.fn();
      lateQueue.setProcessor(lateProcessor);

      // Need to trigger processing since it was enqueued before processor
      lateQueue.enqueue(createEnvelope('message.start'));
      jest.advanceTimersByTime(16);

      expect(lateProcessor).toHaveBeenCalled();
    });
  });
});
