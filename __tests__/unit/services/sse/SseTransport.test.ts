/**
 * SseTransport Tests
 *
 * Tests for low-level SSE connection wrapper.
 * Uses mock EventSource for unit testing.
 */

import { SseTransport } from '@/services/sse/SseTransport';
import type { SseEventEnvelope } from '@/services/sse/EventQueue';

// Mock react-native-sse
const mockEventSource = {
  addEventListener: jest.fn(),
  close: jest.fn(),
};

jest.mock('react-native-sse', () => {
  return jest.fn().mockImplementation(() => mockEventSource);
});

describe('SseTransport', () => {
  let transport: SseTransport;
  let onEvent: jest.Mock;
  let onConnectionStateChange: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    onEvent = jest.fn();
    onConnectionStateChange = jest.fn();
    transport = new SseTransport('test-connection');
  });

  afterEach(() => {
    transport.disconnect();
  });

  describe('connection', () => {
    it('should connect to SSE endpoint', () => {
      transport.connect('http://localhost:4096');

      expect(mockEventSource.addEventListener).toHaveBeenCalledWith(
        'open',
        expect.any(Function)
      );
    });

    it('should notify connection state changes', () => {
      transport.onConnectionStateChange(onConnectionStateChange);
      transport.connect('http://localhost:4096');

      expect(onConnectionStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'connecting' })
      );
    });

    it('should track lastEventId for resume', () => {
      transport.connect('http://localhost:4096');

      // Simulate receiving event with ID
      const messageHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message.start'
      );

      if (messageHandler) {
        messageHandler[1]({
          data: JSON.stringify({ sessionId: 's1', messageId: 'm1', role: 'assistant' }),
          lastEventId: 'event-123',
        });
      }

      expect(transport.lastEventId).toBe('event-123');
    });
  });

  describe('event parsing', () => {
    it('should parse and emit events', () => {
      transport.onEvent(onEvent);
      transport.connect('http://localhost:4096');

      // Find the message.start handler
      const startHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message.start'
      );

      expect(startHandler).toBeDefined();

      // Simulate event
      startHandler![1]({
        data: JSON.stringify({
          sessionId: 'session-1',
          messageId: 'msg-1',
          role: 'assistant',
        }),
      });

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message.start',
          sessionId: 'session-1',
        })
      );
    });

    it('should handle flat event format', () => {
      transport.onEvent(onEvent);
      transport.connect('http://localhost:4096');

      const deltaHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message.delta'
      );

      deltaHandler![1]({
        data: JSON.stringify({
          sessionId: 'session-1',
          messageId: 'msg-1',
          partIndex: 0,
          partType: 'text',
          content: 'Hello',
        }),
      });

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message.delta',
          payload: expect.objectContaining({
            content: 'Hello',
          }),
        })
      );
    });

    it('should handle nested event format', () => {
      transport.onEvent(onEvent);
      transport.connect('http://localhost:4096');

      const startedHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message.started'
      );

      startedHandler![1]({
        data: JSON.stringify({
          properties: {
            info: {
              sessionID: 'session-1',
              id: 'msg-1',
              role: 'assistant',
              agent: 'build',
            },
          },
        }),
      });

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message.start',
          sessionId: 'session-1',
        })
      );
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect with preserveState', () => {
      transport.connect('http://localhost:4096');
      transport.disconnect(true);

      expect(mockEventSource.close).toHaveBeenCalled();
      expect(transport.baseUrl).toBe('http://localhost:4096'); // Preserved
    });

    it('should handle disconnect without preserveState', () => {
      transport.connect('http://localhost:4096');
      transport.disconnect(false);

      expect(mockEventSource.close).toHaveBeenCalled();
      expect(transport.baseUrl).toBeNull(); // Cleared
    });
  });

  describe('reconnection', () => {
    it('should reconnect with lastEventId', () => {
      transport.connect('http://localhost:4096');

      // Simulate setting lastEventId
      const messageHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message.start'
      );
      messageHandler![1]({
        data: JSON.stringify({ sessionId: 's1', messageId: 'm1', role: 'assistant' }),
        lastEventId: 'event-123',
      });

      transport.disconnect(true);

      // Clear mock calls
      mockEventSource.addEventListener.mockClear();

      transport.reconnect();

      // Should reconnect - EventSource created with lastEventId header
      expect(mockEventSource.addEventListener).toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('should allow multiple event listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      transport.onEvent(listener1);
      transport.onEvent(listener2);
      transport.connect('http://localhost:4096');

      const startHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message.start'
      );

      startHandler![1]({
        data: JSON.stringify({
          sessionId: 'session-1',
          messageId: 'msg-1',
          role: 'assistant',
        }),
      });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should allow unsubscribing', () => {
      const listener = jest.fn();
      const unsubscribe = transport.onEvent(listener);

      transport.connect('http://localhost:4096');
      unsubscribe();

      const startHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'message.start'
      );

      startHandler![1]({
        data: JSON.stringify({
          sessionId: 'session-1',
          messageId: 'msg-1',
          role: 'assistant',
        }),
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('properties', () => {
    it('should expose connectionId', () => {
      expect(transport.connectionId).toBe('test-connection');
    });

    it('should expose isConnected', () => {
      expect(transport.isConnected).toBe(false);

      transport.connect('http://localhost:4096');

      // Simulate open event
      const openHandler = mockEventSource.addEventListener.mock.calls.find(
        (call) => call[0] === 'open'
      );
      openHandler![1]();

      expect(transport.isConnected).toBe(true);
    });

    it('should expose baseUrl', () => {
      expect(transport.baseUrl).toBeNull();

      transport.connect('http://localhost:4096');

      expect(transport.baseUrl).toBe('http://localhost:4096');
    });
  });
});
