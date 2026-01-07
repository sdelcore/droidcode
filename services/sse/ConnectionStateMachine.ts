/**
 * ConnectionStateMachine - Explicit state machine for SSE connection lifecycle.
 *
 * Prevents invalid state transitions and race conditions.
 * Uses connection IDs to prevent stale callbacks from affecting state.
 */

/**
 * Possible connection states.
 */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'backgrounded';

/**
 * Events that can trigger state transitions.
 */
export type ConnectionEvent =
  | { type: 'CONNECT'; url: string; sessionId?: string }
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECT'; preserveState?: boolean }
  | { type: 'ERROR'; error: string }
  | { type: 'RETRY' }
  | { type: 'MAX_RETRIES_REACHED' }
  | { type: 'APP_BACKGROUNDED' }
  | { type: 'APP_FOREGROUNDED' }
  | { type: 'SESSION_CHANGED'; newSessionId: string };

/**
 * Full connection state.
 */
export interface ConnectionState {
  status: ConnectionStatus;
  url: string | null;
  sessionId: string | null;
  connectionId: string | null;
  lastEventId: string | null;
  error: string | null;
  reconnectAttempt: number;
}

type StateListener = (state: ConnectionState) => void;

/**
 * State machine for managing SSE connection lifecycle.
 */
export class ConnectionStateMachine {
  private status: ConnectionStatus = 'disconnected';
  private url: string | null = null;
  private sessionId: string | null = null;
  private connectionId: string | null = null;
  private lastEventId: string | null = null;
  private error: string | null = null;
  private reconnectAttempt = 0;
  private listeners: Set<StateListener> = new Set();

  /**
   * Get the current state.
   */
  getState(): ConnectionState {
    return {
      status: this.status,
      url: this.url,
      sessionId: this.sessionId,
      connectionId: this.connectionId,
      lastEventId: this.lastEventId,
      error: this.error,
      reconnectAttempt: this.reconnectAttempt,
    };
  }

  /**
   * Generate unique connection ID.
   */
  private generateConnectionId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Check if a connection ID is the current active connection.
   */
  isCurrentConnection(connectionId: string): boolean {
    if (!connectionId) return false;
    return this.connectionId === connectionId;
  }

  /**
   * Set the last event ID (for resume capability).
   */
  setLastEventId(eventId: string): void {
    this.lastEventId = eventId;
  }

  /**
   * Set the session ID.
   */
  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  /**
   * Add a state change listener.
   */
  addListener(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change.
   */
  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.error('Error in state listener:', e);
      }
    }
  }

  /**
   * Transition to a new state based on an event.
   * Returns true if transition was valid, false otherwise.
   */
  transition(event: ConnectionEvent): boolean {
    const [nextStatus, valid] = this.computeNextState(event);

    if (!valid) {
      return false;
    }

    // Update state based on event
    this.applyEvent(event, nextStatus);

    // Notify listeners
    this.notifyListeners();

    return true;
  }

  /**
   * Compute the next state based on current state and event.
   * Returns [nextStatus, isValid].
   */
  private computeNextState(
    event: ConnectionEvent
  ): [ConnectionStatus, boolean] {
    switch (this.status) {
      case 'disconnected':
        return this.handleDisconnectedState(event);
      case 'connecting':
        return this.handleConnectingState(event);
      case 'connected':
        return this.handleConnectedState(event);
      case 'reconnecting':
        return this.handleReconnectingState(event);
      case 'error':
        return this.handleErrorState(event);
      case 'backgrounded':
        return this.handleBackgroundedState(event);
      default:
        return [this.status, false];
    }
  }

  private handleDisconnectedState(
    event: ConnectionEvent
  ): [ConnectionStatus, boolean] {
    switch (event.type) {
      case 'CONNECT':
        return ['connecting', true];
      case 'DISCONNECT':
        return ['disconnected', true]; // No-op but valid
      default:
        return [this.status, false];
    }
  }

  private handleConnectingState(
    event: ConnectionEvent
  ): [ConnectionStatus, boolean] {
    switch (event.type) {
      case 'CONNECTED':
        return ['connected', true];
      case 'ERROR':
        return ['error', true];
      case 'DISCONNECT':
        return ['disconnected', true];
      case 'SESSION_CHANGED':
        return ['disconnected', true];
      default:
        return [this.status, false];
    }
  }

  private handleConnectedState(
    event: ConnectionEvent
  ): [ConnectionStatus, boolean] {
    switch (event.type) {
      case 'DISCONNECT':
        return ['disconnected', true];
      case 'ERROR':
        return ['reconnecting', true];
      case 'APP_BACKGROUNDED':
        return ['backgrounded', true];
      case 'SESSION_CHANGED':
        return ['disconnected', true];
      case 'CONNECT':
        // Allow new connect - will disconnect first
        return ['connecting', true];
      default:
        return [this.status, false];
    }
  }

  private handleReconnectingState(
    event: ConnectionEvent
  ): [ConnectionStatus, boolean] {
    switch (event.type) {
      case 'CONNECTED':
        return ['connected', true];
      case 'ERROR':
        return ['reconnecting', true]; // Stay in reconnecting, increment attempt
      case 'MAX_RETRIES_REACHED':
        return ['error', true];
      case 'DISCONNECT':
        return ['disconnected', true];
      case 'SESSION_CHANGED':
        return ['disconnected', true];
      default:
        return [this.status, false];
    }
  }

  private handleErrorState(
    event: ConnectionEvent
  ): [ConnectionStatus, boolean] {
    switch (event.type) {
      case 'CONNECT':
        return ['connecting', true];
      case 'RETRY':
        return ['reconnecting', true];
      case 'DISCONNECT':
        return ['disconnected', true];
      case 'SESSION_CHANGED':
        return ['disconnected', true];
      default:
        return [this.status, false];
    }
  }

  private handleBackgroundedState(
    event: ConnectionEvent
  ): [ConnectionStatus, boolean] {
    switch (event.type) {
      case 'APP_FOREGROUNDED':
        return ['reconnecting', true];
      case 'DISCONNECT':
        return ['disconnected', true];
      case 'SESSION_CHANGED':
        return ['disconnected', true];
      default:
        return [this.status, false];
    }
  }

  /**
   * Apply event effects to state.
   */
  private applyEvent(event: ConnectionEvent, nextStatus: ConnectionStatus): void {
    const prevStatus = this.status;
    this.status = nextStatus;

    switch (event.type) {
      case 'CONNECT':
        this.url = event.url;
        this.sessionId = event.sessionId ?? null;
        this.connectionId = this.generateConnectionId();
        this.reconnectAttempt = 0;
        this.error = null;
        break;

      case 'CONNECTED':
        this.reconnectAttempt = 0;
        this.error = null;
        break;

      case 'DISCONNECT':
        this.connectionId = null;
        if (!event.preserveState) {
          this.url = null;
          this.sessionId = null;
          this.lastEventId = null;
        }
        this.error = null;
        break;

      case 'ERROR':
        this.error = event.error;
        // Increment reconnect attempt when going from reconnecting to reconnecting
        if (prevStatus === 'reconnecting' || prevStatus === 'connected') {
          this.reconnectAttempt++;
        }
        break;

      case 'MAX_RETRIES_REACHED':
        this.error = 'Max reconnection attempts reached';
        break;

      case 'SESSION_CHANGED':
        this.connectionId = null;
        this.url = null;
        this.sessionId = null;
        this.error = null;
        break;

      case 'RETRY':
        // No additional state changes needed
        break;

      case 'APP_BACKGROUNDED':
        // Preserve lastEventId for resume
        break;

      case 'APP_FOREGROUNDED':
        // lastEventId preserved from backgrounding
        break;
    }
  }
}
