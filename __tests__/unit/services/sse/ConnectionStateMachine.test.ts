/**
 * ConnectionStateMachine Tests
 *
 * Tests for explicit state machine for SSE connection lifecycle.
 * Prevents invalid state transitions and race conditions.
 */

import {
  ConnectionStateMachine,
  ConnectionEvent,
  ConnectionStatus,
} from '@/services/sse/ConnectionStateMachine';

describe('ConnectionStateMachine', () => {
  let machine: ConnectionStateMachine;

  beforeEach(() => {
    machine = new ConnectionStateMachine();
  });

  describe('initial state', () => {
    it('should start in disconnected state', () => {
      expect(machine.getState().status).toBe('disconnected');
    });

    it('should have null url and sessionId initially', () => {
      const state = machine.getState();
      expect(state.url).toBeNull();
      expect(state.sessionId).toBeNull();
    });

    it('should have zero reconnect attempts initially', () => {
      expect(machine.getState().reconnectAttempt).toBe(0);
    });
  });

  describe('state transitions', () => {
    describe('from disconnected', () => {
      it('should transition: disconnected + CONNECT → connecting', () => {
        const result = machine.transition({
          type: 'CONNECT',
          url: 'http://localhost:4096',
          sessionId: 'session-1',
        });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('connecting');
        expect(machine.getState().url).toBe('http://localhost:4096');
        expect(machine.getState().sessionId).toBe('session-1');
      });

      it('should reject: disconnected + CONNECTED (invalid)', () => {
        const result = machine.transition({ type: 'CONNECTED' });

        expect(result).toBe(false);
        expect(machine.getState().status).toBe('disconnected');
      });

      it('should reject: disconnected + DISCONNECT', () => {
        const result = machine.transition({ type: 'DISCONNECT' });

        // Disconnect from disconnected is a no-op but valid
        expect(result).toBe(true);
        expect(machine.getState().status).toBe('disconnected');
      });

      it('should reject: disconnected + ERROR', () => {
        const result = machine.transition({ type: 'ERROR', error: 'test' });

        expect(result).toBe(false);
        expect(machine.getState().status).toBe('disconnected');
      });
    });

    describe('from connecting', () => {
      beforeEach(() => {
        machine.transition({
          type: 'CONNECT',
          url: 'http://localhost:4096',
          sessionId: 'session-1',
        });
      });

      it('should transition: connecting + CONNECTED → connected', () => {
        const result = machine.transition({ type: 'CONNECTED' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('connected');
      });

      it('should transition: connecting + ERROR → error', () => {
        const result = machine.transition({
          type: 'ERROR',
          error: 'Connection failed',
        });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('error');
        expect(machine.getState().error).toBe('Connection failed');
      });

      it('should transition: connecting + DISCONNECT → disconnected', () => {
        const result = machine.transition({ type: 'DISCONNECT' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('disconnected');
      });

      it('should reject: connecting + RETRY', () => {
        const result = machine.transition({ type: 'RETRY' });

        expect(result).toBe(false);
        expect(machine.getState().status).toBe('connecting');
      });
    });

    describe('from connected', () => {
      beforeEach(() => {
        machine.transition({
          type: 'CONNECT',
          url: 'http://localhost:4096',
          sessionId: 'session-1',
        });
        machine.transition({ type: 'CONNECTED' });
      });

      it('should transition: connected + DISCONNECT → disconnected', () => {
        const result = machine.transition({ type: 'DISCONNECT' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('disconnected');
      });

      it('should transition: connected + ERROR → reconnecting', () => {
        const result = machine.transition({
          type: 'ERROR',
          error: 'Connection lost',
        });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('reconnecting');
      });

      it('should transition: connected + APP_BACKGROUNDED → backgrounded', () => {
        const result = machine.transition({ type: 'APP_BACKGROUNDED' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('backgrounded');
      });

      it('should reject: connected + CONNECT', () => {
        const result = machine.transition({
          type: 'CONNECT',
          url: 'http://other:4096',
          sessionId: 'session-2',
        });

        // Should disconnect first, so this should work
        expect(result).toBe(true);
      });
    });

    describe('from backgrounded', () => {
      beforeEach(() => {
        machine.transition({
          type: 'CONNECT',
          url: 'http://localhost:4096',
          sessionId: 'session-1',
        });
        machine.transition({ type: 'CONNECTED' });
        machine.transition({ type: 'APP_BACKGROUNDED' });
      });

      it('should transition: backgrounded + APP_FOREGROUNDED → reconnecting', () => {
        const result = machine.transition({ type: 'APP_FOREGROUNDED' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('reconnecting');
      });

      it('should transition: backgrounded + DISCONNECT → disconnected', () => {
        const result = machine.transition({ type: 'DISCONNECT' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('disconnected');
      });

      it('should transition: backgrounded + SESSION_CHANGED → disconnected', () => {
        const result = machine.transition({
          type: 'SESSION_CHANGED',
          newSessionId: 'session-2',
        });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('disconnected');
      });
    });

    describe('from reconnecting', () => {
      beforeEach(() => {
        machine.transition({
          type: 'CONNECT',
          url: 'http://localhost:4096',
          sessionId: 'session-1',
        });
        machine.transition({ type: 'CONNECTED' });
        machine.transition({ type: 'ERROR', error: 'Lost' });
      });

      it('should transition: reconnecting + CONNECTED → connected', () => {
        const result = machine.transition({ type: 'CONNECTED' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('connected');
      });

      it('should transition: reconnecting + ERROR → error (increment attempt)', () => {
        const attemptBefore = machine.getState().reconnectAttempt;
        machine.transition({ type: 'ERROR', error: 'Failed again' });

        expect(machine.getState().reconnectAttempt).toBe(attemptBefore + 1);
      });

      it('should transition: reconnecting + MAX_RETRIES_REACHED → error', () => {
        const result = machine.transition({ type: 'MAX_RETRIES_REACHED' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('error');
      });

      it('should transition: reconnecting + DISCONNECT → disconnected', () => {
        const result = machine.transition({ type: 'DISCONNECT' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('disconnected');
      });
    });

    describe('from error', () => {
      beforeEach(() => {
        machine.transition({
          type: 'CONNECT',
          url: 'http://localhost:4096',
          sessionId: 'session-1',
        });
        machine.transition({ type: 'ERROR', error: 'Failed' });
      });

      it('should transition: error + CONNECT → connecting (reset attempts)', () => {
        const result = machine.transition({
          type: 'CONNECT',
          url: 'http://localhost:4096',
          sessionId: 'session-1',
        });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('connecting');
        expect(machine.getState().reconnectAttempt).toBe(0);
      });

      it('should transition: error + RETRY → reconnecting', () => {
        const result = machine.transition({ type: 'RETRY' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('reconnecting');
      });

      it('should transition: error + DISCONNECT → disconnected', () => {
        const result = machine.transition({ type: 'DISCONNECT' });

        expect(result).toBe(true);
        expect(machine.getState().status).toBe('disconnected');
      });
    });
  });

  describe('connection ID race prevention', () => {
    it('should generate unique connectionId on CONNECT', () => {
      machine.transition({
        type: 'CONNECT',
        url: 'http://localhost:4096',
        sessionId: 'session-1',
      });

      const connectionId1 = machine.getState().connectionId;
      expect(connectionId1).not.toBeNull();

      // New connect should generate new ID
      machine.transition({ type: 'DISCONNECT' });
      machine.transition({
        type: 'CONNECT',
        url: 'http://localhost:4096',
        sessionId: 'session-1',
      });

      const connectionId2 = machine.getState().connectionId;
      expect(connectionId2).not.toBeNull();
      expect(connectionId2).not.toBe(connectionId1);
    });

    it('should invalidate old connectionId on SESSION_CHANGED', () => {
      machine.transition({
        type: 'CONNECT',
        url: 'http://localhost:4096',
        sessionId: 'session-1',
      });
      machine.transition({ type: 'CONNECTED' });

      const oldConnectionId = machine.getState().connectionId;

      machine.transition({
        type: 'SESSION_CHANGED',
        newSessionId: 'session-2',
      });

      // After session change, old connection ID should be invalid
      expect(machine.isCurrentConnection(oldConnectionId!)).toBe(false);
    });

    it('should validate connectionId with isCurrentConnection()', () => {
      machine.transition({
        type: 'CONNECT',
        url: 'http://localhost:4096',
        sessionId: 'session-1',
      });

      const connectionId = machine.getState().connectionId;
      expect(machine.isCurrentConnection(connectionId!)).toBe(true);
      expect(machine.isCurrentConnection('random-id')).toBe(false);
    });

    it('should return false for null connectionId', () => {
      expect(machine.isCurrentConnection(null as any)).toBe(false);
    });
  });

  describe('reconnection tracking', () => {
    beforeEach(() => {
      machine.transition({
        type: 'CONNECT',
        url: 'http://localhost:4096',
        sessionId: 'session-1',
      });
      machine.transition({ type: 'CONNECTED' });
    });

    it('should track reconnectAttempt count', () => {
      expect(machine.getState().reconnectAttempt).toBe(0);

      machine.transition({ type: 'ERROR', error: 'Lost' });
      expect(machine.getState().reconnectAttempt).toBe(1);

      machine.transition({ type: 'ERROR', error: 'Failed' });
      expect(machine.getState().reconnectAttempt).toBe(2);
    });

    it('should reset reconnect attempts on successful connect', () => {
      machine.transition({ type: 'ERROR', error: 'Lost' });
      machine.transition({ type: 'ERROR', error: 'Failed' });
      expect(machine.getState().reconnectAttempt).toBe(2);

      machine.transition({ type: 'CONNECTED' });
      expect(machine.getState().reconnectAttempt).toBe(0);
    });

    it('should preserve lastEventId through backgrounding', () => {
      machine.setLastEventId('event-123');
      machine.transition({ type: 'APP_BACKGROUNDED' });

      expect(machine.getState().lastEventId).toBe('event-123');

      machine.transition({ type: 'APP_FOREGROUNDED' });
      expect(machine.getState().lastEventId).toBe('event-123');
    });

    it('should clear lastEventId on explicit disconnect without preserve', () => {
      machine.setLastEventId('event-123');
      machine.transition({ type: 'DISCONNECT', preserveState: false });

      expect(machine.getState().lastEventId).toBeNull();
    });

    it('should preserve lastEventId on disconnect with preserveState', () => {
      machine.setLastEventId('event-123');
      machine.transition({ type: 'DISCONNECT', preserveState: true });

      expect(machine.getState().lastEventId).toBe('event-123');
    });
  });

  describe('state change listeners', () => {
    it('should notify listeners on state change', () => {
      const listener = jest.fn();
      machine.addListener(listener);

      machine.transition({
        type: 'CONNECT',
        url: 'http://localhost:4096',
        sessionId: 'session-1',
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'connecting' })
      );
    });

    it('should allow removing listeners', () => {
      const listener = jest.fn();
      const unsubscribe = machine.addListener(listener);

      machine.transition({
        type: 'CONNECT',
        url: 'http://localhost:4096',
        sessionId: 'session-1',
      });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      machine.transition({ type: 'CONNECTED' });
      expect(listener).toHaveBeenCalledTimes(1); // No additional call
    });

    it('should not notify on invalid transitions', () => {
      const listener = jest.fn();
      machine.addListener(listener);

      // Invalid transition from disconnected
      machine.transition({ type: 'CONNECTED' });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('session change handling', () => {
    it('should handle SESSION_CHANGED from connected state', () => {
      machine.transition({
        type: 'CONNECT',
        url: 'http://localhost:4096',
        sessionId: 'session-1',
      });
      machine.transition({ type: 'CONNECTED' });

      const result = machine.transition({
        type: 'SESSION_CHANGED',
        newSessionId: 'session-2',
      });

      expect(result).toBe(true);
      expect(machine.getState().status).toBe('disconnected');
      expect(machine.getState().sessionId).toBeNull();
    });

    it('should handle SESSION_CHANGED from connecting state', () => {
      machine.transition({
        type: 'CONNECT',
        url: 'http://localhost:4096',
        sessionId: 'session-1',
      });

      const result = machine.transition({
        type: 'SESSION_CHANGED',
        newSessionId: 'session-2',
      });

      expect(result).toBe(true);
      expect(machine.getState().status).toBe('disconnected');
    });
  });
});
