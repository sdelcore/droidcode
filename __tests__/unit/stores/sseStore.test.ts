/**
 * sseStore Tests
 *
 * Tests for SSE connection state management store.
 * Uses new ConnectionStateMachine and SseTransport.
 */

import { act } from '@testing-library/react-native';
import type { ConnectionState } from '@/services/sse/ConnectionStateMachine';
import type { SseEventEnvelope } from '@/services/sse/EventQueue';

// Mock SseTransport
const mockTransport = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  reconnect: jest.fn(),
  onEvent: jest.fn(() => jest.fn()),
  onConnectionStateChange: jest.fn(() => jest.fn()),
  isConnected: false,
  baseUrl: null,
  lastEventId: null,
  connectionId: 'test-connection',
};

jest.mock('@/services/sse/SseTransport', () => ({
  SseTransport: jest.fn().mockImplementation(() => mockTransport),
}));

// Mock ConnectionStateMachine
const mockStateMachine = {
  state: {
    status: 'disconnected',
    url: null,
    sessionId: null,
    connectionId: null,
    lastEventId: null,
    error: null,
    reconnectAttempt: 0,
  } as ConnectionState,
  transition: jest.fn(() => true),
  isCurrentConnection: jest.fn(() => true),
  setLastEventId: jest.fn(),
  setSessionId: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

jest.mock('@/services/sse/ConnectionStateMachine', () => ({
  ConnectionStateMachine: jest.fn().mockImplementation(() => mockStateMachine),
}));

// Mock EventQueue
const mockEventQueue = {
  enqueue: jest.fn(),
  clear: jest.fn(),
  setProcessor: jest.fn(),
  getStats: jest.fn(() => ({
    queuedEvents: 0,
    processedEvents: 0,
    droppedEvents: 0,
  })),
};

jest.mock('@/services/sse/EventQueue', () => ({
  EventQueue: jest.fn().mockImplementation(() => mockEventQueue),
}));

// Import after mocks
import { useSseStore } from '@/stores/sseStore';

describe('sseStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock state
    mockStateMachine.state = {
      status: 'disconnected',
      url: null,
      sessionId: null,
      connectionId: null,
      lastEventId: null,
      error: null,
      reconnectAttempt: 0,
    };
    mockTransport.isConnected = false;
    mockTransport.baseUrl = null;

    // Reset store state
    useSseStore.setState({
      connectionState: mockStateMachine.state,
      isConnecting: false,
      error: null,
    });
  });

  describe('initial state', () => {
    it('should start in disconnected state', () => {
      const state = useSseStore.getState();

      expect(state.connectionState.status).toBe('disconnected');
      expect(state.isConnecting).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should expose connection state', () => {
      const state = useSseStore.getState();

      expect(state.connectionState).toBeDefined();
      expect(state.connectionState.status).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should connect with state machine', async () => {
      const { connect } = useSseStore.getState();

      await act(async () => {
        await connect('http://localhost:4096');
      });

      expect(mockStateMachine.transition).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CONNECT' })
      );
    });

    it('should update isConnecting based on connection result', async () => {
      const { connect } = useSseStore.getState();

      await act(async () => {
        await connect('http://localhost:4096');
      });

      // After successful connect, isConnecting should be false
      const state = useSseStore.getState();
      expect(state.isConnecting).toBe(false);
    });

    it('should call transport connect', async () => {
      const { connect } = useSseStore.getState();

      await act(async () => {
        await connect('http://localhost:4096');
      });

      expect(mockTransport.connect).toHaveBeenCalledWith('http://localhost:4096');
    });

    it('should handle connection errors', async () => {
      mockTransport.connect.mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });

      const { connect } = useSseStore.getState();

      await act(async () => {
        await connect('http://localhost:4096');
      });

      const state = useSseStore.getState();
      expect(state.error).toBe('Connection failed');
      expect(state.isConnecting).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect transport', async () => {
      const { disconnect } = useSseStore.getState();

      await act(async () => {
        disconnect();
      });

      expect(mockTransport.disconnect).toHaveBeenCalled();
    });

    it('should transition state machine', async () => {
      const { disconnect } = useSseStore.getState();

      await act(async () => {
        disconnect();
      });

      expect(mockStateMachine.transition).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DISCONNECT' })
      );
    });

    it('should clear event queue', async () => {
      const { disconnect } = useSseStore.getState();

      await act(async () => {
        disconnect();
      });

      expect(mockEventQueue.clear).toHaveBeenCalled();
    });
  });

  describe('session changes', () => {
    it('should handle session changes', async () => {
      const { setSessionId } = useSseStore.getState();

      await act(async () => {
        setSessionId('new-session');
      });

      expect(mockStateMachine.setSessionId).toHaveBeenCalledWith('new-session');
    });

    it('should clear queue on session change', async () => {
      const { setSessionId } = useSseStore.getState();

      await act(async () => {
        setSessionId('new-session');
      });

      expect(mockEventQueue.clear).toHaveBeenCalled();
    });
  });

  describe('app lifecycle', () => {
    it('should handle app backgrounding', async () => {
      // First connect
      mockStateMachine.state.status = 'connected';
      useSseStore.setState({ connectionState: { ...mockStateMachine.state } });

      const { handleAppBackground } = useSseStore.getState();

      await act(async () => {
        handleAppBackground();
      });

      expect(mockStateMachine.transition).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'APP_BACKGROUNDED' })
      );
    });

    it('should disconnect transport on background', async () => {
      mockStateMachine.state.status = 'connected';
      useSseStore.setState({ connectionState: { ...mockStateMachine.state } });

      const { handleAppBackground } = useSseStore.getState();

      await act(async () => {
        handleAppBackground();
      });

      expect(mockTransport.disconnect).toHaveBeenCalledWith(true); // preserveState=true
    });

    it('should handle app foregrounding with resume', async () => {
      // Simulate backgrounded state
      mockStateMachine.state.status = 'backgrounded';
      mockStateMachine.state.url = 'http://localhost:4096';
      useSseStore.setState({ connectionState: { ...mockStateMachine.state } });

      const { handleAppForeground } = useSseStore.getState();

      await act(async () => {
        await handleAppForeground();
      });

      expect(mockStateMachine.transition).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'APP_FOREGROUNDED' })
      );
    });

    it('should reconnect on foreground if was backgrounded', async () => {
      mockStateMachine.state.status = 'backgrounded';
      mockStateMachine.state.url = 'http://localhost:4096';
      useSseStore.setState({ connectionState: { ...mockStateMachine.state } });

      const { handleAppForeground } = useSseStore.getState();

      await act(async () => {
        await handleAppForeground();
      });

      expect(mockTransport.reconnect).toHaveBeenCalled();
    });

    it('should not reconnect if was not connected', async () => {
      mockStateMachine.state.status = 'disconnected';
      useSseStore.setState({ connectionState: { ...mockStateMachine.state } });

      const { handleAppForeground } = useSseStore.getState();

      await act(async () => {
        await handleAppForeground();
      });

      expect(mockTransport.reconnect).not.toHaveBeenCalled();
    });
  });

  describe('event handling', () => {
    it('should subscribe to transport events on connect', async () => {
      const { connect } = useSseStore.getState();

      await act(async () => {
        await connect('http://localhost:4096');
      });

      expect(mockTransport.onEvent).toHaveBeenCalled();
    });

    it('should enqueue events to event queue', async () => {
      // Get the event callback that was registered
      let eventCallback: ((event: SseEventEnvelope) => void) | null = null;
      (mockTransport.onEvent as jest.Mock).mockImplementation((cb: (event: SseEventEnvelope) => void) => {
        eventCallback = cb;
        return jest.fn();
      });

      const { connect } = useSseStore.getState();

      await act(async () => {
        await connect('http://localhost:4096');
      });

      // Simulate event
      const testEvent: SseEventEnvelope = {
        eventId: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
        type: 'message.start',
        payload: { messageId: 'msg-1', role: 'assistant' },
      };

      await act(async () => {
        eventCallback?.(testEvent);
      });

      expect(mockEventQueue.enqueue).toHaveBeenCalledWith(testEvent);
    });
  });

  describe('connection state updates', () => {
    it('should expose connectionState from store', () => {
      const state = useSseStore.getState();

      expect(state.connectionState).toBeDefined();
      expect(state.connectionState.status).toBe('disconnected');
    });

    it('should track error state', async () => {
      mockTransport.connect.mockImplementationOnce(() => {
        throw new Error('Test error');
      });

      const { connect } = useSseStore.getState();

      await act(async () => {
        await connect('http://localhost:4096');
      });

      const state = useSseStore.getState();
      expect(state.error).toBe('Test error');
    });
  });

  describe('event processor', () => {
    it('should allow setting event processor', async () => {
      const processor = jest.fn();
      const { setEventProcessor } = useSseStore.getState();

      await act(async () => {
        setEventProcessor(processor);
      });

      expect(mockEventQueue.setProcessor).toHaveBeenCalledWith(processor);
    });
  });

  describe('queue stats', () => {
    it('should expose queue stats', () => {
      const { getQueueStats } = useSseStore.getState();

      const stats = getQueueStats();

      expect(stats).toEqual({
        queuedEvents: 0,
        processedEvents: 0,
        droppedEvents: 0,
      });
    });
  });

  describe('cleanup', () => {
    it('should cleanup on reset', async () => {
      const { reset } = useSseStore.getState();

      await act(async () => {
        reset();
      });

      expect(mockTransport.disconnect).toHaveBeenCalledWith(false); // Don't preserve state
      expect(mockEventQueue.clear).toHaveBeenCalled();
    });
  });
});
