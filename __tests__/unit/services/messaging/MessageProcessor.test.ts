/**
 * MessageProcessor Tests
 *
 * Tests for event-to-message transformation with deduplication and recovery.
 */

import { MessageProcessor, SessionEvent } from '@/services/messaging/MessageProcessor';
import type { SseEventEnvelope } from '@/services/sse/EventQueue';
import type { MessageDto } from '@/types';

// Helper to create event envelopes
function createEnvelope<T>(
  type: string,
  payload: T,
  sessionId = 'session-1'
): SseEventEnvelope<T> {
  return {
    eventId: `event-${Date.now()}-${Math.random()}`,
    sessionId,
    timestamp: Date.now(),
    type,
    payload,
  };
}

describe('MessageProcessor', () => {
  let processor: MessageProcessor;
  let onMessageUpdate: jest.Mock;
  let onMessageComplete: jest.Mock;
  let onSessionEvent: jest.Mock;
  let mockLogger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  beforeEach(() => {
    onMessageUpdate = jest.fn();
    onMessageComplete = jest.fn();
    onSessionEvent = jest.fn();
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    processor = new MessageProcessor({
      sessionId: 'session-1',
      onMessageUpdate,
      onMessageComplete,
      onSessionEvent,
      logger: mockLogger,
    });
  });

  describe('message lifecycle', () => {
    it('should handle start → delta → complete flow', () => {
      // Start
      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-1',
          role: 'assistant',
          agent: 'build',
        })
      );

      expect(onMessageUpdate).toHaveBeenCalledTimes(1);
      expect(onMessageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'msg-1', role: 'assistant' }),
        true
      );

      // Delta
      processor.processEvent(
        createEnvelope('message.delta', {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'Hello World',
        })
      );

      expect(onMessageUpdate).toHaveBeenCalledTimes(2);
      const lastUpdate = onMessageUpdate.mock.calls[1][0] as MessageDto;
      expect(lastUpdate.parts[0].text).toBe('Hello World');

      // Complete
      processor.processEvent(
        createEnvelope('message.complete', {
          messageId: 'msg-1',
        })
      );

      expect(onMessageComplete).toHaveBeenCalledTimes(1);
      expect(onMessageComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-1',
          parts: [{ type: 'text', text: 'Hello World' }],
        })
      );
    });

    it('should call onMessageUpdate during streaming', () => {
      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-1',
          role: 'assistant',
        })
      );

      processor.processEvent(
        createEnvelope('message.delta', {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'First',
        })
      );

      processor.processEvent(
        createEnvelope('message.delta', {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: ' Second',
        })
      );

      // Start + 2 deltas = 3 updates
      expect(onMessageUpdate).toHaveBeenCalledTimes(3);
      expect(onMessageUpdate.mock.calls[2][1]).toBe(true); // isStreaming
    });

    it('should call onMessageComplete when done', () => {
      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-1',
          role: 'assistant',
        })
      );

      processor.processEvent(
        createEnvelope('message.complete', {
          messageId: 'msg-1',
        })
      );

      expect(onMessageComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('session filtering', () => {
    it('should ignore events from other sessions', () => {
      processor.processEvent(
        createEnvelope(
          'message.start',
          { messageId: 'msg-1', role: 'assistant' },
          'other-session' // Different session
        )
      );

      expect(onMessageUpdate).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should process events from correct session', () => {
      processor.processEvent(
        createEnvelope(
          'message.start',
          { messageId: 'msg-1', role: 'assistant' },
          'session-1' // Matching session
        )
      );

      expect(onMessageUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('deduplication', () => {
    it('should ignore duplicate message.start events', () => {
      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-1',
          role: 'assistant',
        })
      );

      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-1',
          role: 'assistant',
        })
      );

      // Should only process once
      expect(onMessageUpdate).toHaveBeenCalledTimes(1);
    });

    it('should ignore delta for completed messages', () => {
      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-1',
          role: 'assistant',
        })
      );

      processor.processEvent(
        createEnvelope('message.complete', {
          messageId: 'msg-1',
        })
      );

      // Late delta after complete
      processor.processEvent(
        createEnvelope('message.delta', {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'Late delta',
        })
      );

      // Should not update after complete
      const updateCalls = onMessageUpdate.mock.calls.length;
      expect(updateCalls).toBe(1); // Only the initial start
    });
  });

  describe('recovery', () => {
    it('should auto-create message on delta without start', () => {
      // Delta without prior start
      processor.processEvent(
        createEnvelope('message.delta', {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'Orphan delta',
        })
      );

      expect(onMessageUpdate).toHaveBeenCalledTimes(1);
      expect(onMessageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-1',
          role: 'assistant', // Default role
        }),
        true
      );
    });

    it('should log warning on auto-recovery', () => {
      processor.processEvent(
        createEnvelope('message.delta', {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'Orphan delta',
        })
      );

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('optimistic messages', () => {
    it('should match optimistic user message on start', () => {
      // Track optimistic message
      processor.trackOptimisticMessage('user-temp-123');

      // Server sends start event for user message
      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'user-real-456',
          role: 'user',
        })
      );

      // Should not create duplicate message for matched optimistic
      // The first call should not happen because it was matched
      expect(onMessageUpdate).not.toHaveBeenCalled();
    });

    it('should not create duplicate for matched optimistic', () => {
      processor.trackOptimisticMessage('user-temp-123');

      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'user-real-456',
          role: 'user',
        })
      );

      processor.processEvent(
        createEnvelope('message.complete', {
          messageId: 'user-real-456',
        })
      );

      // No messages should be emitted for matched optimistic user messages
      expect(onMessageComplete).not.toHaveBeenCalled();
    });
  });

  describe('session events', () => {
    it('should emit todo.updated events', () => {
      processor.processEvent(
        createEnvelope('todo.updated', {
          todos: [{ id: 'todo-1', text: 'Test', completed: false }],
        })
      );

      expect(onSessionEvent).toHaveBeenCalledWith({
        type: 'todo.updated',
        todos: [{ id: 'todo-1', text: 'Test', completed: false }],
      });
    });

    it('should emit session.status events', () => {
      processor.processEvent(
        createEnvelope('session.status', {
          status: 'busy',
        })
      );

      expect(onSessionEvent).toHaveBeenCalledWith({
        type: 'session.status',
        status: 'busy',
      });
    });

    it('should emit permission.requested events', () => {
      processor.processEvent(
        createEnvelope('permission.requested', {
          permissionId: 'perm-1',
          messageId: 'msg-1',
          toolType: 'bash',
          title: 'Run command?',
        })
      );

      expect(onSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'permission.requested',
        })
      );
    });

    it('should emit session.diff events', () => {
      processor.processEvent(
        createEnvelope('session.diff.updated', {
          files: [{ path: '/test.ts', status: 'modified' }],
        })
      );

      expect(onSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'session.diff',
        })
      );
    });

    it('should emit error events', () => {
      processor.processEvent(
        createEnvelope('error', {
          message: 'Something went wrong',
        })
      );

      expect(onSessionEvent).toHaveBeenCalledWith({
        type: 'error',
        message: 'Something went wrong',
      });
    });
  });

  describe('reset', () => {
    it('should clear all state on reset', () => {
      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-1',
          role: 'assistant',
        })
      );

      processor.reset();

      expect(processor.activeStreamingCount).toBe(0);
    });
  });

  describe('multiple messages', () => {
    it('should handle concurrent streaming messages', () => {
      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-1',
          role: 'assistant',
        })
      );

      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-2',
          role: 'assistant',
        })
      );

      expect(processor.activeStreamingCount).toBe(2);

      processor.processEvent(
        createEnvelope('message.delta', {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'First message',
        })
      );

      processor.processEvent(
        createEnvelope('message.delta', {
          messageId: 'msg-2',
          partId: 'part-1',
          partType: 'text',
          content: 'Second message',
        })
      );

      // Both messages should be tracked separately
      expect(onMessageUpdate).toHaveBeenCalledTimes(4);
    });
  });

  describe('tool events', () => {
    it('should handle tool part updates', () => {
      processor.processEvent(
        createEnvelope('message.start', {
          messageId: 'msg-1',
          role: 'assistant',
        })
      );

      processor.processEvent(
        createEnvelope('message.delta', {
          messageId: 'msg-1',
          partId: 'tool-1',
          partType: 'tool',
          content: '',
          toolName: 'bash',
          status: 'running',
        })
      );

      const lastUpdate = onMessageUpdate.mock.calls.slice(-1)[0][0] as MessageDto;
      expect(lastUpdate.parts[0].type).toBe('tool');
      expect(lastUpdate.parts[0].toolName).toBe('bash');
    });
  });
});
