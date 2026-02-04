import EventSource from 'react-native-sse';
import type {
  SseEvent,
  ConnectionState,
  MessageStartFlatData,
  MessageDeltaData,
  MessageCompleteData,
  SessionUpdateFlatData,
  TodoUpdatedEventData,
  SessionDiffEventData,
  PermissionUpdatedEventData,
  PermissionRepliedEventData,
  SessionStatusEventData,
  ErrorEventData,
  MessagePartUpdatedData,
  MessageStartedData,
  QuestionAskedEventData,
  QuestionRepliedEventData,
  QuestionRejectedEventData,
} from '@/types';
import { sseLogger } from '@/services/debug';

type EventCallback = (event: SseEvent) => void;
type ConnectionCallback = (state: ConnectionState) => void;

// High-frequency / low-value events - log at debug level only
const DEBUG_ONLY_EVENTS = new Set([
  'server.heartbeat',
  'lsp.client.diagnostics',
  'lsp.updated',
  'file.watcher.updated',
  'file.edited',
  'installation.updated',
  'tool.execute.before',
  'tool.execute.after',
  'message.removed',
  'message.part.removed',
  'command.executed',
]);

/**
 * SSE Client for real-time event streaming.
 * Ported from: data/remote/sse/SseClient.kt
 *
 * Supports lifecycle-aware reconnection:
 * - Tracks lastEventId for resume capability
 * - Provides reconnect() for foreground transitions
 * - Graceful disconnect for background transitions
 *
 * Can be instantiated multiple times for multi-server connections.
 */
export class SseClient {
  private _connectionId: string;
  private _endpoint: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private eventSource: any = null;
  private eventCallbacks: EventCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private baseUrl: string | null = null;
  private lastEventId: string | null = null;
  private isManualDisconnect = false;

  // Connection promise tracking
  private connectionPromise: Promise<void> | null = null;
  private connectionResolve: (() => void) | null = null;
  private connectionReject: ((error: Error) => void) | null = null;

  constructor(connectionId = 'default', endpoint = '/event') {
    this._connectionId = connectionId;
    this._endpoint = endpoint;
  }

  /**
   * Get the connection ID (for identifying this client in multi-connection scenarios).
   */
  get connectionId(): string {
    return this._connectionId;
  }

  /**
   * Check if currently connected.
   */
  get isConnected(): boolean {
    return this.eventSource !== null;
  }

  /**
   * Get the current base URL (for reconnection).
   */
  get currentBaseUrl(): string | null {
    return this.baseUrl;
  }

  /**
   * Connect to SSE stream and return a Promise that resolves when connected.
   * @param baseUrl - The base URL to connect to
   * @returns Promise that resolves when connected or rejects on failure
   */
  connect(baseUrl: string): Promise<void> {
    console.log(`[SSE:${this._connectionId}] Connecting to:`, baseUrl);

    // Close existing connection if any to prevent orphaned connections
    if (this.eventSource) {
      console.log(`[SSE:${this._connectionId}] Closing existing connection before reconnect`);
      this.eventSource.close();
      this.eventSource = null;
    }

    this.baseUrl = baseUrl;
    this.isManualDisconnect = false;

    // Clear any existing connection promise state
    this.clearConnectionPromise();

    // Create new connection promise
    this.connectionPromise = new Promise<void>((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;
    });

    this.doConnect();
    return this.connectionPromise;
  }

  /**
   * Wait for an existing connection attempt to complete.
   * Returns immediately if already connected.
   * @param timeout - Maximum time to wait in ms (default: 10000)
   * @returns true if connected, false if failed or timed out
   */
  async waitForConnection(timeout = 10000): Promise<boolean> {
    // Already connected
    if (this.eventSource && this.connectionPromise === null) {
      return true;
    }

    // Waiting for existing connection attempt
    if (this.connectionPromise) {
      try {
        await Promise.race([
          this.connectionPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Wait timeout')), timeout)
          ),
        ]);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  private clearConnectionPromise(): void {
    this.connectionResolve = null;
    this.connectionReject = null;
  }

  private resolveConnection(): void {
    if (this.connectionResolve) {
      this.connectionResolve();
    }
    this.clearConnectionPromise();
  }

  private rejectConnection(error: Error): void {
    if (this.connectionReject) {
      this.connectionReject(error);
    }
    this.clearConnectionPromise();
  }

  /**
   * Reconnect to the same server (used after app returns to foreground).
   * Uses Last-Event-ID header if available to resume from last position.
   */
  reconnect(): void {
    if (!this.baseUrl) {
      console.log('[SSE] Cannot reconnect: no baseUrl');
      return;
    }

    // Don't reconnect if already connected
    if (this.eventSource) {
      console.log('[SSE] Already connected, skipping reconnect');
      return;
    }

    console.log('[SSE] Reconnecting...', this.lastEventId ? `from event ${this.lastEventId}` : '');
    this.isManualDisconnect = false;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  /**
   * Retry connection after giving up due to max attempts or error state.
   * Resets attempt counter and immediately tries to reconnect.
   * Use this when network connectivity is restored.
   */
  retryConnection(): void {
    if (!this.baseUrl) {
      console.log(`[SSE:${this._connectionId}] Cannot retry: no baseUrl`);
      return;
    }

    console.log(`[SSE:${this._connectionId}] Retry requested - resetting attempts and reconnecting`);
    this.reconnectAttempts = 0;
    this.isManualDisconnect = false;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.baseUrl) {
      console.log(`[SSE:${this._connectionId}] Cannot connect: no baseUrl`);
      return;
    }

    const url = `${this.baseUrl}${this._endpoint}`;
    console.log(`[SSE:${this._connectionId}] Opening EventSource to:`, url);

    this.notifyConnectionState({ status: 'connecting' });

    // Build headers with optional Last-Event-ID for resume
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };

    if (this.lastEventId) {
      headers['Last-Event-ID'] = this.lastEventId;
    }

    this.eventSource = new EventSource(url, { headers });

    this.eventSource.addEventListener('open', () => {
      console.log(`[SSE:${this._connectionId}] Connected successfully`);
      this.reconnectAttempts = 0;
      this.notifyConnectionState({ status: 'connected' });
      // Resolve the connection promise on successful connect
      this.resolveConnection();
    });

    this.eventSource.addEventListener('error', (event: { message?: string }) => {
      const message = event.message || 'Connection error';
      console.log(`[SSE:${this._connectionId}] Connection error:`, message);
      this.notifyConnectionState({ status: 'error', message });

      // Reject the connection promise if this is the initial connection attempt
      if (this.connectionReject) {
        this.rejectConnection(new Error(message));
      }

      this.handleReconnect();
    });

    // Listen for all event types
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.eventSource) return;

    // PRIMARY: Listen for generic 'message' events
    // OpenCode server sends events with `event: message` and the actual type in JSON's `type` field
    this.eventSource.addEventListener('message', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type || 'unknown';
        this.handleEvent(eventType, event.data, event.lastEventId);
      } catch (error) {
        sseLogger.error(`Failed to parse message event: ${error}`);
      }
    });

    // FALLBACK: Also listen for named events in case server uses explicit event types
    const namedEventTypes = [
      'message.start', 'message.delta', 'message.complete',
      'message.started', 'message.part.updated', 'message.updated', 'message.completed',
      'session.created', 'session.updated', 'session.deleted', 'session.status', 'session.diff',
      'todo.updated', 'permission.updated', 'permission.replied', 'server.connected'
    ];

    for (const eventType of namedEventTypes) {
      this.eventSource.addEventListener(eventType, (event: any) => {
        this.handleEvent(eventType, event.data, event.lastEventId);
      });
    }

    // Error events (special handling - may not have data)
    this.eventSource.addEventListener('error', (event: any) => {
      if (event.data) {
        this.handleEvent('error', event.data, event.lastEventId);
      }
    });
  }

  private handleEvent(eventType: string, data: string, eventId?: string): void {
    try {
      // Track last event ID for resume capability
      if (eventId) {
        this.lastEventId = eventId;
      }

      const parsed = JSON.parse(data);

      // Log received event - use debug level for high-frequency or unknown events to reduce noise
      if (DEBUG_ONLY_EVENTS.has(eventType) || eventType === 'unknown') {
        sseLogger.debug(`Received: ${eventType}`);
      } else {
        const eventSessionId = parsed.sessionId || parsed.properties?.info?.sessionID || 'none';
        sseLogger.info(`Received: ${eventType} (session: ${eventSessionId})`);
      }

      const event = this.parseEvent(eventType, parsed);
      if (event) {
        this.notifyEvent(event);
      }
    } catch (error) {
      sseLogger.error(`Parse failed: ${eventType} - ${error}`);
    }
  }

  private parseEvent(eventType: string, data: any): SseEvent | null {
    switch (eventType) {
      // Flat format (preferred)
      case 'message.start': {
        const d = data as MessageStartFlatData;
        return {
          type: 'message.start',
          sessionId: d.sessionId,
          messageId: d.messageId,
          role: d.role as 'user' | 'assistant',
          agent: d.agent,
        };
      }

      case 'message.delta': {
        const d = data as MessageDeltaData;
        return {
          type: 'message.delta',
          sessionId: d.sessionId,
          messageId: d.messageId,
          partId: `${d.messageId}-${d.partIndex}`,
          partType: d.partType,
          content: d.content,
          toolName: d.toolName,
          toolInput: d.input,
          toolOutput: d.output,
        };
      }

      case 'message.complete': {
        const d = data as MessageCompleteData;
        return {
          type: 'message.complete',
          sessionId: d.sessionId,
          messageId: d.messageId,
        };
      }

      case 'session.updated': {
        // Handle both formats:
        // 1. Global event format: { properties: { info: Session } }
        // 2. Per-session flat format: { sessionId, title }
        if (data.properties?.info) {
          // Global format - full session update
          return {
            type: 'session.updated.global',
            info: data.properties.info,
          };
        } else {
          // Flat format - title update only
          const d = data as SessionUpdateFlatData;
          return {
            type: 'session.updated',
            sessionId: d.sessionId,
            title: d.title,
          };
        }
      }

      // Nested format (fallback for older API versions)
      case 'message.started': {
        const d = data as MessageStartedData;
        return {
          type: 'message.start',
          sessionId: d.properties.info.sessionID,
          messageId: d.properties.info.id,
          role: d.properties.info.role as 'user' | 'assistant',
          agent: d.properties.info.agent,
        };
      }

      case 'message.part.updated': {
        const d = data as MessagePartUpdatedData;
        const part = d.properties.part;
        const delta = d.properties.delta || '';

        // Determine content based on part type
        let content = delta;
        let toolInput: string | undefined;
        let toolOutput: string | undefined;
        let toolStatus: string | undefined;
        let toolName: string | undefined;

        if (part.type === 'tool') {
          toolName = part.tool || part.toolName;
          if (part.state) {
            toolStatus = part.state.status;
            toolInput = typeof part.state.input === 'string'
              ? part.state.input
              : JSON.stringify(part.state.input);
            toolOutput = part.state.output;
          }
        }

        return {
          type: 'message.delta',
          sessionId: part.sessionID,
          messageId: part.messageID,
          partId: part.id,
          partType: part.type,
          content,
          toolName,
          toolInput,
          toolOutput,
          toolStatus: toolStatus as any,
        };
      }

      case 'session.status': {
        const d = data as SessionStatusEventData;
        return {
          type: 'session.status',
          sessionId: d.properties.sessionID,
          status: d.properties.status.type as 'busy' | 'idle',
        };
      }

      // Global SSE events from /global/event endpoint
      case 'session.created': {
        // Global event format: { properties: { info: Session } }
        if (data.properties?.info) {
          return {
            type: 'session.created',
            info: data.properties.info,
          };
        }
        sseLogger.warn('session.created event missing properties.info');
        return null;
      }

      case 'session.deleted': {
        // Global event format: { properties: { info: Session } }
        if (data.properties?.info) {
          return {
            type: 'session.deleted',
            info: data.properties.info,
          };
        }
        sseLogger.warn('session.deleted event missing properties.info');
        return null;
      }

      case 'todo.updated': {
        const d = data as TodoUpdatedEventData;
        return {
          type: 'todo.updated',
          sessionId: d.properties.sessionID,
          todos: d.properties.todos,
        };
      }

      case 'session.diff':
      case 'session.diff.updated': {
        const d = data as SessionDiffEventData;
        return {
          type: 'session.diff',
          sessionId: d.properties.sessionID,
          files: d.properties.diff,
        };
      }

      case 'permission.updated': {
        const d = data as PermissionUpdatedEventData;
        return {
          type: 'permission.requested',
          sessionId: d.properties.sessionID,
          messageId: d.properties.messageID,
          permissionId: d.properties.id,
          toolType: d.properties.type,
          title: d.properties.title,
          metadata: d.properties.metadata,
        };
      }

      case 'permission.replied': {
        const d = data as PermissionRepliedEventData;
        return {
          type: 'permission.replied',
          sessionId: d.properties.sessionID,
          permissionId: d.properties.permissionID,
          response: d.properties.response,
        };
      }

      case 'message.updated':
      case 'message.completed': {
        // Nested format for message completion
        const d = data as MessageStartedData; // Reuses same structure
        return {
          type: 'message.complete',
          sessionId: d.properties.info.sessionID,
          messageId: d.properties.info.id,
        };
      }

      case 'error': {
        const d = data as ErrorEventData;
        return {
          type: 'error',
          code: d.properties?.code || d.code || 'unknown',
          message: d.properties?.message || d.message || 'Unknown error',
        };
      }

      // Server lifecycle events
      case 'server.heartbeat':
        return { type: 'server.heartbeat' };

      case 'server.connected':
        return { type: 'server.connected' };

      // File system events
      case 'file.watcher.updated':
        return { type: 'file.watcher.updated', path: data.path };

      case 'file.edited':
        return { type: 'file.edited', path: data.path };

      // LSP events
      case 'lsp.client.diagnostics':
        return { type: 'lsp.client.diagnostics', diagnostics: data.properties };

      case 'lsp.updated':
        return { type: 'lsp.updated' };

      // Additional session events
      case 'session.compacted':
        return {
          type: 'session.compacted',
          sessionId: data.sessionId || data.properties?.sessionID,
        };

      case 'session.error':
        return {
          type: 'session.error',
          sessionId: data.sessionId || data.properties?.sessionID,
          error: data.error || data.message || 'Unknown error',
        };

      case 'session.idle':
        return {
          type: 'session.idle',
          sessionId: data.sessionId || data.properties?.sessionID,
        };

      // Installation events
      case 'installation.updated':
        return { type: 'installation.updated' };

      // Message removal events (acknowledge but no action needed)
      case 'message.removed':
        return {
          type: 'message.removed',
          sessionId: data.properties?.sessionID || data.sessionId,
          messageId: data.properties?.messageID || data.messageId,
        };

      case 'message.part.removed':
        return {
          type: 'message.part.removed',
          sessionId: data.properties?.sessionID || data.sessionId,
          partId: data.properties?.partID || data.partId,
        };

      // Tool execution events
      case 'tool.execute.before':
        return {
          type: 'tool.execute.before',
          sessionId: data.properties?.sessionID || data.sessionId,
          toolName: data.properties?.tool || data.tool,
        };

      case 'tool.execute.after':
        return {
          type: 'tool.execute.after',
          sessionId: data.properties?.sessionID || data.sessionId,
          toolName: data.properties?.tool || data.tool,
        };

      // Command events
      case 'command.executed':
        return {
          type: 'command.executed',
          sessionId: data.properties?.sessionID || data.sessionId,
          command: data.properties?.command || data.command,
        };

      // Question events (AI asking user questions)
      case 'question.asked': {
        const d = data as QuestionAskedEventData;
        return {
          type: 'question.asked',
          sessionId: d.properties.sessionID,
          requestId: d.properties.id,
          questions: d.properties.questions.map((q) => ({
            question: q.question,
            header: q.header,
            options: q.options.map((o) => ({
              label: o.label,
              description: o.description,
            })),
            multiple: q.multiple,
          })),
          tool: d.properties.tool
            ? {
                messageId: d.properties.tool.messageID,
                callId: d.properties.tool.callID,
              }
            : undefined,
        };
      }

      case 'question.replied': {
        const d = data as QuestionRepliedEventData;
        return {
          type: 'question.replied',
          sessionId: d.properties.sessionID,
          requestId: d.properties.requestID,
          answers: d.properties.answers,
        };
      }

      case 'question.rejected': {
        const d = data as QuestionRejectedEventData;
        return {
          type: 'question.rejected',
          sessionId: d.properties.sessionID,
          requestId: d.properties.requestID,
        };
      }

      default:
        return {
          type: 'unknown',
          eventType,
          rawData: JSON.stringify(data),
        };
    }
  }

  private handleReconnect(): void {
    // Don't auto-reconnect if manually disconnected (e.g., app backgrounded)
    if (this.isManualDisconnect) {
      console.log('[SSE] Skipping auto-reconnect (manual disconnect)');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.notifyConnectionState({
        status: 'error',
        message: 'Max reconnection attempts reached',
      });
      return;
    }

    this.reconnectAttempts++;
    this.notifyConnectionState({ status: 'reconnecting' });

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => {
      this.doConnect();
    }, Math.min(delay, 30000));
  }

  /**
   * Disconnect from SSE stream.
   * @param preserveState - If true, keeps lastEventId for reconnection (e.g., backgrounding).
   *                        If false, clears all state (e.g., switching servers).
   */
  disconnect(preserveState = true): void {
    this.isManualDisconnect = true;

    // Clear any pending connection promise
    if (this.connectionReject) {
      this.rejectConnection(new Error('Disconnected'));
    }
    this.connectionPromise = null;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (!preserveState) {
      this.lastEventId = null;
      this.baseUrl = null;
    }

    this.notifyConnectionState({ status: 'disconnected' });
  }

  /**
   * Clear all state (used when switching to a different server).
   */
  reset(): void {
    this.disconnect(false);
    this.reconnectAttempts = 0;
  }

  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback);
    };
  }

  onConnectionStateChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.push(callback);
    return () => {
      this.connectionCallbacks = this.connectionCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyEvent(event: SseEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in SSE event callback:', error);
      }
    }
  }

  private notifyConnectionState(state: ConnectionState): void {
    for (const callback of this.connectionCallbacks) {
      try {
        callback(state);
      } catch (error) {
        console.error('Error in connection state callback:', error);
      }
    }
  }
}

export const sseClient = new SseClient();
