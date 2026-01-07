/**
 * sseStore - SSE connection state management.
 *
 * Uses ConnectionStateMachine for lifecycle, SseTransport for low-level SSE,
 * and EventQueue for backpressure handling.
 */

import { create } from 'zustand';
import { SseTransport } from '@/services/sse/SseTransport';
import { ConnectionStateMachine } from '@/services/sse/ConnectionStateMachine';
import type { ConnectionState } from '@/services/sse/ConnectionStateMachine';
import { EventQueue } from '@/services/sse/EventQueue';
import type { SseEventEnvelope, EventQueueStats } from '@/services/sse/EventQueue';

interface SseStoreState {
  // Connection state
  connectionState: ConnectionState;
  isConnecting: boolean;
  error: string | null;

  // Internal - do not use directly
  _initialized: boolean;

  // Actions
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
  setSessionId: (sessionId: string | null) => void;
  handleAppBackground: () => void;
  handleAppForeground: () => Promise<void>;
  setEventProcessor: (processor: (event: SseEventEnvelope) => void) => void;
  getQueueStats: () => EventQueueStats;
  reset: () => void;
}

// Lazy-initialized instances
let transport: SseTransport | null = null;
let stateMachine: ConnectionStateMachine | null = null;
let eventQueue: EventQueue | null = null;

// Cleanup functions
let transportEventUnsubscribe: (() => void) | null = null;
let transportConnectionUnsubscribe: (() => void) | null = null;
let stateMachineUnsubscribe: (() => void) | null = null;

function getTransport(): SseTransport {
  if (!transport) {
    transport = new SseTransport();
  }
  return transport;
}

function getStateMachine(): ConnectionStateMachine {
  if (!stateMachine) {
    stateMachine = new ConnectionStateMachine();
  }
  return stateMachine;
}

function getEventQueue(): EventQueue {
  if (!eventQueue) {
    eventQueue = new EventQueue();
  }
  return eventQueue;
}

const initialState: ConnectionState = {
  status: 'disconnected',
  url: null,
  sessionId: null,
  connectionId: null,
  lastEventId: null,
  error: null,
  reconnectAttempt: 0,
};

export const useSseStore = create<SseStoreState>()((set, get) => ({
  // Initial state
  connectionState: initialState,
  isConnecting: false,
  error: null,
  _initialized: false,

  connect: async (url: string) => {
    const sm = getStateMachine();
    const tr = getTransport();
    const eq = getEventQueue();

    // Initialize state machine listener on first connect
    if (!get()._initialized) {
      stateMachineUnsubscribe = sm.addListener((newState) => {
        set({
          connectionState: newState,
          isConnecting: newState.status === 'connecting' || newState.status === 'reconnecting',
          error: newState.error,
        });
      });
      set({ _initialized: true });
    }

    set({ isConnecting: true, error: null });

    try {
      // Transition state machine
      sm.transition({ type: 'CONNECT', url });

      // Clean up previous subscriptions
      transportEventUnsubscribe?.();
      transportConnectionUnsubscribe?.();

      // Subscribe to transport events
      transportEventUnsubscribe = tr.onEvent((event) => {
        eq.enqueue(event);
      });

      // Subscribe to transport connection state
      transportConnectionUnsubscribe = tr.onConnectionStateChange((state) => {
        if (state.status === 'connected') {
          sm.transition({ type: 'CONNECTED' });
        } else if (state.status === 'error') {
          sm.transition({ type: 'ERROR', error: state.error || 'Connection error' });
        }
      });

      // Connect transport
      tr.connect(url);

      set({ isConnecting: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      sm.transition({ type: 'ERROR', error: message });
      set({ isConnecting: false, error: message });
    }
  },

  disconnect: () => {
    const sm = getStateMachine();
    const tr = getTransport();
    const eq = getEventQueue();

    sm.transition({ type: 'DISCONNECT' });
    tr.disconnect();
    eq.clear();

    // Clean up subscriptions
    transportEventUnsubscribe?.();
    transportConnectionUnsubscribe?.();
    transportEventUnsubscribe = null;
    transportConnectionUnsubscribe = null;
  },

  setSessionId: (sessionId: string | null) => {
    const sm = getStateMachine();
    const eq = getEventQueue();

    sm.setSessionId(sessionId);
    // Clear queue when session changes to avoid stale events
    eq.clear();
  },

  handleAppBackground: () => {
    const sm = getStateMachine();
    const tr = getTransport();

    sm.transition({ type: 'APP_BACKGROUNDED' });
    // Disconnect but preserve state for reconnection
    tr.disconnect(true);
  },

  handleAppForeground: async () => {
    const { connectionState } = get();
    const sm = getStateMachine();
    const tr = getTransport();

    // Only reconnect if we were backgrounded
    if (connectionState.status !== 'backgrounded') {
      return;
    }

    sm.transition({ type: 'APP_FOREGROUNDED' });
    tr.reconnect();
  },

  setEventProcessor: (processor: (event: SseEventEnvelope) => void) => {
    const eq = getEventQueue();
    eq.setProcessor(processor);
  },

  getQueueStats: () => {
    const eq = getEventQueue();
    return eq.getStats();
  },

  reset: () => {
    const tr = getTransport();
    const eq = getEventQueue();

    // Full cleanup
    tr.disconnect(false);
    eq.clear();

    // Clean up subscriptions
    transportEventUnsubscribe?.();
    transportConnectionUnsubscribe?.();
    stateMachineUnsubscribe?.();
    transportEventUnsubscribe = null;
    transportConnectionUnsubscribe = null;
    stateMachineUnsubscribe = null;

    // Reset instances for next use
    transport = null;
    stateMachine = null;
    eventQueue = null;

    set({
      connectionState: initialState,
      isConnecting: false,
      error: null,
      _initialized: false,
    });
  },
}));
