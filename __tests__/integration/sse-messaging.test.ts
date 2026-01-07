/**
 * SSE + Messaging Integration Tests
 *
 * Tests that verify the new SSE and messaging components work together correctly.
 */

import { MessageProcessor, SessionEvent } from '@/services/messaging/MessageProcessor';
import { MessageDeduplicator } from '@/services/messaging/MessageDeduplicator';
import { StreamingMessageState } from '@/services/messaging/StreamingMessageState';
import { ConnectionStateMachine } from '@/services/sse/ConnectionStateMachine';
import { EventQueue } from '@/services/sse/EventQueue';
import type { SseEventEnvelope } from '@/services/sse/EventQueue';
import type { MessageDto } from '@/types';

describe('SSE + Messaging Integration', () => {
  describe('full message flow', () => {
    it('should handle complete message flow from SSE event to message state', () => {
      // Setup
      const messages: MessageDto[] = [];
      const completedMessages: MessageDto[] = [];
      const sessionEvents: SessionEvent[] = [];

      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: (msg, isStreaming) => {
          const index = messages.findIndex(m => m.id === msg.id);
          if (index >= 0) {
            messages[index] = msg;
          } else {
            messages.push(msg);
          }
        },
        onMessageComplete: (msg) => {
          completedMessages.push(msg);
        },
        onSessionEvent: (event) => {
          sessionEvents.push(event);
        },
        logger: mockLogger,
      });

      // Simulate message.start
      processor.processEvent({
        eventId: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.start',
        payload: {
          messageId: 'msg-1',
          role: 'assistant',
          agent: 'build',
        },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('msg-1');
      expect(messages[0].role).toBe('assistant');

      // Simulate text deltas
      processor.processEvent({
        eventId: 'evt-2',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.delta',
        payload: {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'Hello ',
        },
      });

      processor.processEvent({
        eventId: 'evt-3',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.delta',
        payload: {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'World!',
        },
      });

      expect(messages[0].parts[0].text).toBe('Hello World!');

      // Simulate message.complete
      processor.processEvent({
        eventId: 'evt-4',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.complete',
        payload: {
          messageId: 'msg-1',
        },
      });

      expect(completedMessages).toHaveLength(1);
      expect(completedMessages[0].parts[0].text).toBe('Hello World!');
    });

    it('should handle tool use flow', () => {
      const messages: MessageDto[] = [];
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: (msg) => {
          const index = messages.findIndex(m => m.id === msg.id);
          if (index >= 0) {
            messages[index] = msg;
          } else {
            messages.push(msg);
          }
        },
        onMessageComplete: jest.fn(),
        onSessionEvent: jest.fn(),
        logger: mockLogger,
      });

      // Start message
      processor.processEvent({
        eventId: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.start',
        payload: { messageId: 'msg-1', role: 'assistant' },
      });

      // Tool use delta
      processor.processEvent({
        eventId: 'evt-2',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.delta',
        payload: {
          messageId: 'msg-1',
          partId: 'tool-1',
          partType: 'tool',
          content: '',
          toolName: 'Bash',
          status: 'running',
          input: 'ls -la',
        },
      });

      expect(messages[0].parts).toHaveLength(1);
      expect(messages[0].parts[0].type).toBe('tool');
      expect(messages[0].parts[0].toolName).toBe('Bash');

      // Tool completion
      processor.processEvent({
        eventId: 'evt-3',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.delta',
        payload: {
          messageId: 'msg-1',
          partId: 'tool-1',
          partType: 'tool',
          content: '',
          toolName: 'Bash',
          status: 'completed',
          input: 'ls -la',
          output: 'file1.txt\nfile2.txt',
        },
      });

      expect(messages[0].parts[0].state?.status).toBe('completed');
      expect(messages[0].parts[0].state?.output).toBe('file1.txt\nfile2.txt');
    });
  });

  describe('session filtering', () => {
    it('should filter events from other sessions', () => {
      const messages: MessageDto[] = [];
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: (msg) => messages.push(msg),
        onMessageComplete: jest.fn(),
        onSessionEvent: jest.fn(),
        logger: mockLogger,
      });

      // Event from different session
      processor.processEvent({
        eventId: 'evt-1',
        sessionId: 'session-2', // Different session
        timestamp: Date.now(),
        type: 'message.start',
        payload: { messageId: 'msg-1', role: 'assistant' },
      });

      expect(messages).toHaveLength(0);
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('deduplication', () => {
    it('should deduplicate repeated message.start events', () => {
      let updateCount = 0;
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: () => { updateCount++; },
        onMessageComplete: jest.fn(),
        onSessionEvent: jest.fn(),
        logger: mockLogger,
      });

      const startEvent: SseEventEnvelope = {
        eventId: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.start',
        payload: { messageId: 'msg-1', role: 'assistant' },
      };

      // Process same event twice
      processor.processEvent(startEvent);
      processor.processEvent(startEvent);
      processor.processEvent(startEvent);

      // Should only process once
      expect(updateCount).toBe(1);
    });
  });

  describe('auto-recovery', () => {
    it('should auto-create message state on delta without start', () => {
      const messages: MessageDto[] = [];
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: (msg) => {
          const index = messages.findIndex(m => m.id === msg.id);
          if (index >= 0) {
            messages[index] = msg;
          } else {
            messages.push(msg);
          }
        },
        onMessageComplete: jest.fn(),
        onSessionEvent: jest.fn(),
        logger: mockLogger,
      });

      // Delta without prior start (missed event scenario)
      processor.processEvent({
        eventId: 'evt-2',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.delta',
        payload: {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'Recovered content',
        },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('msg-1');
      expect(messages[0].parts[0].text).toBe('Recovered content');
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('EventQueue + MessageProcessor integration', () => {
    it('should process events through queue to processor', async () => {
      jest.useFakeTimers();

      const messages: MessageDto[] = [];
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: (msg) => {
          const index = messages.findIndex(m => m.id === msg.id);
          if (index >= 0) {
            messages[index] = msg;
          } else {
            messages.push(msg);
          }
        },
        onMessageComplete: jest.fn(),
        onSessionEvent: jest.fn(),
        logger: mockLogger,
      });

      const queue = new EventQueue({
        maxQueueSize: 100,
        batchSize: 5,
        batchDelayMs: 16,
      });

      queue.setProcessor((event) => processor.processEvent(event));

      // Enqueue events
      queue.enqueue({
        eventId: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.start',
        payload: { messageId: 'msg-1', role: 'assistant' },
      });

      queue.enqueue({
        eventId: 'evt-2',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.delta',
        payload: {
          messageId: 'msg-1',
          partId: 'part-1',
          partType: 'text',
          content: 'Hello',
        },
      });

      // Process batch
      jest.advanceTimersByTime(0);

      expect(messages).toHaveLength(1);
      expect(messages[0].parts[0].text).toBe('Hello');

      queue.clear();
      jest.useRealTimers();
    });
  });

  describe('ConnectionStateMachine integration', () => {
    it('should manage connection lifecycle', () => {
      const stateMachine = new ConnectionStateMachine();

      expect(stateMachine.getState().status).toBe('disconnected');

      // Connect
      stateMachine.transition({ type: 'CONNECT', url: 'http://localhost:4096', sessionId: 'session-1' });
      expect(stateMachine.getState().status).toBe('connecting');

      // Connected
      stateMachine.transition({ type: 'CONNECTED' });
      expect(stateMachine.getState().status).toBe('connected');

      // Background app
      stateMachine.transition({ type: 'APP_BACKGROUNDED' });
      expect(stateMachine.getState().status).toBe('backgrounded');

      // Foreground app
      stateMachine.transition({ type: 'APP_FOREGROUNDED' });
      expect(stateMachine.getState().status).toBe('reconnecting');

      // Reconnected
      stateMachine.transition({ type: 'CONNECTED' });
      expect(stateMachine.getState().status).toBe('connected');
    });

    it('should validate connection IDs', () => {
      const stateMachine = new ConnectionStateMachine();

      // First connect
      stateMachine.transition({ type: 'CONNECT', url: 'http://localhost:4096', sessionId: 'session-1' });
      const connId1 = stateMachine.getState().connectionId;

      expect(stateMachine.isCurrentConnection(connId1!)).toBe(true);

      // Complete connection
      stateMachine.transition({ type: 'CONNECTED' });

      // Disconnect and reconnect with different session - should get new connection ID
      stateMachine.transition({ type: 'DISCONNECT' });
      stateMachine.transition({ type: 'CONNECT', url: 'http://localhost:4096', sessionId: 'session-2' });
      const connId2 = stateMachine.getState().connectionId;

      // Old connection ID should no longer be valid
      expect(stateMachine.isCurrentConnection(connId1!)).toBe(false);
      expect(stateMachine.isCurrentConnection(connId2!)).toBe(true);
      expect(connId1).not.toBe(connId2);
    });
  });

  describe('session events', () => {
    it('should process session status events', () => {
      const sessionEvents: SessionEvent[] = [];
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: jest.fn(),
        onMessageComplete: jest.fn(),
        onSessionEvent: (event) => sessionEvents.push(event),
        logger: mockLogger,
      });

      processor.processEvent({
        eventId: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'session.status',
        payload: { status: 'busy' },
      });

      expect(sessionEvents).toHaveLength(1);
      expect(sessionEvents[0].type).toBe('session.status');
      expect((sessionEvents[0] as any).status).toBe('busy');
    });

    it('should process todo updates', () => {
      const sessionEvents: SessionEvent[] = [];
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: jest.fn(),
        onMessageComplete: jest.fn(),
        onSessionEvent: (event) => sessionEvents.push(event),
        logger: mockLogger,
      });

      processor.processEvent({
        eventId: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'todo.updated',
        payload: {
          todos: [
            { id: 't1', content: 'Task 1', status: 'pending', activeForm: 'test' },
          ],
        },
      });

      expect(sessionEvents).toHaveLength(1);
      expect(sessionEvents[0].type).toBe('todo.updated');
    });

    it('should process permission requests', () => {
      const sessionEvents: SessionEvent[] = [];
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: jest.fn(),
        onMessageComplete: jest.fn(),
        onSessionEvent: (event) => sessionEvents.push(event),
        logger: mockLogger,
      });

      processor.processEvent({
        eventId: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'permission.requested',
        payload: {
          permissionId: 'perm-1',
          messageId: 'msg-1',
          toolType: 'Bash',
          title: 'Run command?',
        },
      });

      expect(sessionEvents).toHaveLength(1);
      expect(sessionEvents[0].type).toBe('permission.requested');
    });
  });

  describe('optimistic message matching', () => {
    it('should match optimistic user messages', () => {
      let updateCount = 0;
      const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const processor = new MessageProcessor({
        sessionId: 'session-1',
        onMessageUpdate: () => { updateCount++; },
        onMessageComplete: jest.fn(),
        onSessionEvent: jest.fn(),
        logger: mockLogger,
      });

      // Track optimistic message
      processor.trackOptimisticMessage('temp-user-msg');

      // Server sends real user message - should match optimistic
      processor.processEvent({
        eventId: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.start',
        payload: { messageId: 'real-user-msg', role: 'user' },
      });

      // Should not create duplicate message
      expect(updateCount).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Matched optimistic user message')
      );
    });
  });
});
