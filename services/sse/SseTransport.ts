/**
 * SseTransport - Low-level SSE connection wrapper.
 *
 * Wraps react-native-sse EventSource and handles event parsing.
 * Supports both flat and nested event formats from OpenCode API.
 */

import EventSource from 'react-native-sse';
import type { SseEventEnvelope } from './EventQueue';
import type { ConnectionState } from './ConnectionStateMachine';

type EventCallback = (event: SseEventEnvelope) => void;
type ConnectionCallback = (state: ConnectionState) => void;

/**
 * Low-level SSE transport.
 */
export class SseTransport {
  private _connectionId: string;
  private eventSource: EventSource | null = null;
  private eventCallbacks: EventCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  private _baseUrl: string | null = null;
  private _lastEventId: string | null = null;
  private _isConnected = false;

  constructor(connectionId = 'default') {
    this._connectionId = connectionId;
  }

  /** Connection ID for identification */
  get connectionId(): string {
    return this._connectionId;
  }

  /** Whether currently connected */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /** Current base URL */
  get baseUrl(): string | null {
    return this._baseUrl;
  }

  /** Last event ID for resume */
  get lastEventId(): string | null {
    return this._lastEventId;
  }

  /**
   * Connect to SSE endpoint.
   */
  connect(baseUrl: string): void {
    // Close existing connection
    if (this.eventSource) {
      this.eventSource.close();
    }

    this._baseUrl = baseUrl;
    this._isConnected = false;

    this.notifyConnectionState({ status: 'connecting', url: baseUrl, sessionId: null, connectionId: null, lastEventId: null, error: null, reconnectAttempt: 0 });

    const url = `${baseUrl}/event`;
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };

    if (this._lastEventId) {
      headers['Last-Event-ID'] = this._lastEventId;
    }

    this.eventSource = new EventSource(url, { headers });

    this.setupEventListeners();
  }

  /**
   * Reconnect using stored baseUrl and lastEventId.
   */
  reconnect(): void {
    if (!this._baseUrl) {
      return;
    }
    this.connect(this._baseUrl);
  }

  /**
   * Disconnect from SSE.
   */
  disconnect(preserveState = true): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this._isConnected = false;

    if (!preserveState) {
      this._baseUrl = null;
      this._lastEventId = null;
    }

    this.notifyConnectionState({ status: 'disconnected', url: null, sessionId: null, connectionId: null, lastEventId: null, error: null, reconnectAttempt: 0 });
  }

  /**
   * Subscribe to events.
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Subscribe to connection state changes.
   */
  onConnectionStateChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.push(callback);
    return () => {
      this.connectionCallbacks = this.connectionCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  private setupEventListeners(): void {
    if (!this.eventSource) return;

    // Connection events
    this.eventSource.addEventListener('open', () => {
      this._isConnected = true;
      this.notifyConnectionState({ status: 'connected', url: this._baseUrl, sessionId: null, connectionId: null, lastEventId: this._lastEventId, error: null, reconnectAttempt: 0 });
    });

    this.eventSource.addEventListener('error', (event: any) => {
      this._isConnected = false;
      this.notifyConnectionState({
        status: 'error',
        url: this._baseUrl,
        sessionId: null,
        connectionId: null,
        lastEventId: this._lastEventId,
        error: event.message || 'Connection error',
        reconnectAttempt: 0,
      });
    });

    // Type cast needed because react-native-sse doesn't include custom event types
    const addCustomEventListener = (eventType: string, handler: (event: any) => void) => {
      this.eventSource?.addEventListener(eventType as any, handler);
    };

    // Message events - flat format
    addCustomEventListener('message.start', (event) => {
      this.handleEvent('message.start', event.data, event.lastEventId);
    });

    addCustomEventListener('message.delta', (event) => {
      this.handleEvent('message.delta', event.data, event.lastEventId);
    });

    addCustomEventListener('message.complete', (event) => {
      this.handleEvent('message.complete', event.data, event.lastEventId);
    });

    // Message events - nested format
    addCustomEventListener('message.started', (event) => {
      this.handleEvent('message.started', event.data, event.lastEventId);
    });

    addCustomEventListener('message.part.updated', (event) => {
      this.handleEvent('message.part.updated', event.data, event.lastEventId);
    });

    addCustomEventListener('message.completed', (event) => {
      this.handleEvent('message.completed', event.data, event.lastEventId);
    });

    // Session events
    addCustomEventListener('session.status', (event) => {
      this.handleEvent('session.status', event.data, event.lastEventId);
    });

    addCustomEventListener('session.updated', (event) => {
      this.handleEvent('session.updated', event.data, event.lastEventId);
    });

    addCustomEventListener('session.diff.updated', (event) => {
      this.handleEvent('session.diff.updated', event.data, event.lastEventId);
    });

    // Feature events
    addCustomEventListener('todo.updated', (event) => {
      this.handleEvent('todo.updated', event.data, event.lastEventId);
    });

    addCustomEventListener('permission.updated', (event) => {
      this.handleEvent('permission.updated', event.data, event.lastEventId);
    });

    // Error events
    this.eventSource.addEventListener('error', (event: any) => {
      if (event.data) {
        this.handleEvent('error', event.data, event.lastEventId);
      }
    });
  }

  private handleEvent(eventType: string, data: string, eventId?: string): void {
    try {
      if (eventId) {
        this._lastEventId = eventId;
      }

      const parsed = JSON.parse(data);
      const envelope = this.parseToEnvelope(eventType, parsed);

      if (envelope) {
        this.notifyEvent(envelope);
      }
    } catch (error) {
      console.error(`[SseTransport] Parse error for ${eventType}:`, error);
    }
  }

  private parseToEnvelope(
    eventType: string,
    data: any
  ): SseEventEnvelope | null {
    const envelope: SseEventEnvelope = {
      eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sessionId: '',
      timestamp: Date.now(),
      type: eventType,
      payload: data,
    };

    // Handle flat format
    if (data.sessionId) {
      envelope.sessionId = data.sessionId;

      // Normalize event type and payload
      switch (eventType) {
        case 'message.start':
          envelope.type = 'message.start';
          envelope.payload = {
            messageId: data.messageId,
            role: data.role,
            agent: data.agent,
          };
          break;
        case 'message.delta':
          envelope.type = 'message.delta';
          envelope.payload = {
            messageId: data.messageId,
            partId: `${data.messageId}-${data.partIndex}`,
            partType: data.partType,
            content: data.content,
            toolName: data.toolName,
            input: data.input,
            output: data.output,
          };
          break;
        case 'message.complete':
          envelope.type = 'message.complete';
          envelope.payload = { messageId: data.messageId };
          break;
        default:
          // Keep original payload
          break;
      }

      return envelope;
    }

    // Handle nested format
    if (data.properties) {
      const props = data.properties;

      switch (eventType) {
        case 'message.started':
          envelope.type = 'message.start';
          envelope.sessionId = props.info.sessionID;
          envelope.payload = {
            messageId: props.info.id,
            role: props.info.role,
            agent: props.info.agent,
          };
          break;
        case 'message.part.updated':
          envelope.type = 'message.delta';
          envelope.sessionId = props.part.sessionID;
          envelope.payload = {
            messageId: props.part.messageID,
            partId: props.part.id,
            partType: props.part.type,
            content: props.delta || '',
            toolName: props.part.tool || props.part.toolName,
            input: props.part.state?.input,
            output: props.part.state?.output,
            status: props.part.state?.status,
          };
          break;
        case 'message.completed':
          envelope.type = 'message.complete';
          envelope.sessionId = props.info.sessionID;
          envelope.payload = { messageId: props.info.id };
          break;
        case 'session.status':
          envelope.type = 'session.status';
          envelope.sessionId = props.sessionID;
          envelope.payload = { status: props.status.type };
          break;
        case 'todo.updated':
          envelope.type = 'todo.updated';
          envelope.sessionId = props.sessionID;
          envelope.payload = { todos: props.todos };
          break;
        case 'session.diff.updated':
          envelope.type = 'session.diff.updated';
          envelope.sessionId = props.sessionID;
          envelope.payload = { files: props.diff };
          break;
        case 'permission.updated':
          envelope.type = 'permission.requested';
          envelope.sessionId = props.sessionID;
          envelope.payload = {
            permissionId: props.id,
            messageId: props.messageID,
            toolType: props.type,
            title: props.title,
            metadata: props.metadata,
          };
          break;
        default:
          envelope.sessionId = props.sessionID || '';
          break;
      }

      return envelope;
    }

    // Fallback - return with empty sessionId
    return envelope;
  }

  private notifyEvent(event: SseEventEnvelope): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('[SseTransport] Event callback error:', error);
      }
    }
  }

  private notifyConnectionState(state: ConnectionState): void {
    for (const callback of this.connectionCallbacks) {
      try {
        callback(state);
      } catch (error) {
        console.error('[SseTransport] Connection callback error:', error);
      }
    }
  }
}
