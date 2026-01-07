/**
 * SSE Connection Manager for handling multiple SSE connections.
 * Enables receiving notifications from all running OpenCode servers simultaneously.
 */

import { Platform } from 'react-native';
import { SseClient } from './sseClient';
import { sseBackgroundServiceManager } from './native';
import type { SseEvent, ConnectionState } from '@/types';

type EventCallback = (connectionId: string, event: SseEvent) => void;
type ConnectionCallback = (connectionId: string, state: ConnectionState) => void;

interface ConnectionInfo {
  client: SseClient;
  url: string;
  unsubscribeEvent: () => void;
  unsubscribeState: () => void;
}

class SseConnectionManager {
  private connections: Map<string, ConnectionInfo> = new Map();
  private eventCallbacks: Set<EventCallback> = new Set();
  private stateCallbacks: Set<ConnectionCallback> = new Set();

  /**
   * Connect to an OpenCode server (fire-and-forget).
   * @param connectionId Unique identifier for this connection (e.g., "project-123")
   * @param url Base URL of the OpenCode server (e.g., "http://localhost:4100")
   * @param endpoint SSE endpoint path (default: "/event", can be "/global/event")
   */
  connect(connectionId: string, url: string, endpoint = '/event'): void {
    // Don't reconnect if already connected to same URL
    const existing = this.connections.get(connectionId);
    if (existing && existing.url === url && existing.client.isConnected) {
      console.log(`[SSE Manager] Already connected to ${connectionId}`);
      return;
    }

    // Disconnect existing connection if URL changed
    if (existing) {
      this.disconnect(connectionId);
    }

    console.log(`[SSE Manager] Connecting ${connectionId} to ${url}${endpoint}`);
    const client = new SseClient(connectionId, endpoint);

    // Subscribe to events and forward with connectionId
    const unsubscribeEvent = client.onEvent((event) => {
      this.eventCallbacks.forEach((cb) => {
        try {
          cb(connectionId, event);
        } catch (error) {
          console.error(`[SSE Manager] Error in event callback for ${connectionId}:`, error);
        }
      });
    });

    // Subscribe to connection state changes
    const unsubscribeState = client.onConnectionStateChange((state) => {
      this.stateCallbacks.forEach((cb) => {
        try {
          cb(connectionId, state);
        } catch (error) {
          console.error(`[SSE Manager] Error in state callback for ${connectionId}:`, error);
        }
      });
    });

    client.connect(url);

    this.connections.set(connectionId, {
      client,
      url,
      unsubscribeEvent,
      unsubscribeState,
    });

    // Start Android foreground service to keep SSE alive when backgrounded
    if (Platform.OS === 'android') {
      sseBackgroundServiceManager.startIfNeeded(this.connections.size);
      sseBackgroundServiceManager.updateConnectionCount(this.connections.size);
    }
  }

  /**
   * Connect to an OpenCode server and wait for connection.
   * @param connectionId Unique identifier for this connection (e.g., "chat-session123")
   * @param url Base URL of the OpenCode server (e.g., "http://localhost:4100")
   * @param endpoint SSE endpoint path (default: "/event", can be "/global/event")
   * @returns Promise that resolves when connected or rejects on failure
   */
  async connectAsync(connectionId: string, url: string, endpoint = '/event'): Promise<void> {
    // Don't reconnect if already connected to same URL
    const existing = this.connections.get(connectionId);
    if (existing && existing.url === url && existing.client.isConnected) {
      console.log(`[SSE Manager] Already connected to ${connectionId}`);
      return;
    }

    // Disconnect existing connection if URL changed
    if (existing) {
      this.disconnect(connectionId);
    }

    console.log(`[SSE Manager] Connecting async ${connectionId} to ${url}${endpoint}`);
    const client = new SseClient(connectionId, endpoint);

    // Subscribe to events and forward with connectionId
    const unsubscribeEvent = client.onEvent((event) => {
      this.eventCallbacks.forEach((cb) => {
        try {
          cb(connectionId, event);
        } catch (error) {
          console.error(`[SSE Manager] Error in event callback for ${connectionId}:`, error);
        }
      });
    });

    // Subscribe to connection state changes
    const unsubscribeState = client.onConnectionStateChange((state) => {
      this.stateCallbacks.forEach((cb) => {
        try {
          cb(connectionId, state);
        } catch (error) {
          console.error(`[SSE Manager] Error in state callback for ${connectionId}:`, error);
        }
      });
    });

    // Store connection info before attempting connection
    this.connections.set(connectionId, {
      client,
      url,
      unsubscribeEvent,
      unsubscribeState,
    });

    try {
      // Wait for connection (no timeout - will wait indefinitely until connected or error)
      await client.connect(url);

      // Start Android foreground service to keep SSE alive when backgrounded
      if (Platform.OS === 'android') {
        sseBackgroundServiceManager.startIfNeeded(this.connections.size);
        sseBackgroundServiceManager.updateConnectionCount(this.connections.size);
      }
    } catch (error) {
      // Clean up on failure
      this.disconnect(connectionId);
      throw error;
    }
  }

  /**
   * Disconnect from a specific server.
   * @param connectionId The connection to disconnect
   * @param preserveState If true, keeps lastEventId for reconnection
   */
  disconnect(connectionId: string, preserveState = false): void {
    const info = this.connections.get(connectionId);
    if (info) {
      console.log(`[SSE Manager] Disconnecting ${connectionId}`);
      info.unsubscribeEvent();
      info.unsubscribeState();
      info.client.disconnect(preserveState);
      this.connections.delete(connectionId);

      // Update or stop Android foreground service
      if (Platform.OS === 'android') {
        sseBackgroundServiceManager.updateConnectionCount(this.connections.size);
        sseBackgroundServiceManager.stopIfNoConnections(this.connections.size);
      }
    }
  }

  /**
   * Disconnect all connections (e.g., when app goes to background).
   * @param preserveState If true, keeps state for reconnection
   */
  disconnectAll(preserveState = false): void {
    console.log(`[SSE Manager] Disconnecting all (${this.connections.size} connections)`);
    this.connections.forEach((info, connectionId) => {
      info.client.disconnect(preserveState);
    });

    if (!preserveState) {
      // Clear all subscriptions and connections
      this.connections.forEach((info) => {
        info.unsubscribeEvent();
        info.unsubscribeState();
      });
      this.connections.clear();

      // Stop Android foreground service when all connections are gone
      if (Platform.OS === 'android') {
        sseBackgroundServiceManager.stop();
      }
    }
  }

  /**
   * Reconnect all connections (e.g., when app returns to foreground).
   */
  reconnectAll(): void {
    console.log(`[SSE Manager] Reconnecting all (${this.connections.size} connections)`);
    this.connections.forEach((info) => {
      info.client.reconnect();
    });
  }

  /**
   * Subscribe to events from all connections.
   * @returns Unsubscribe function
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => {
      this.eventCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to connection state changes from all connections.
   * @returns Unsubscribe function
   */
  onConnectionStateChange(callback: ConnectionCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  /**
   * Get all active connection IDs.
   */
  getConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if a connection exists.
   */
  isConnected(connectionId: string): boolean {
    const info = this.connections.get(connectionId);
    return info?.client.isConnected ?? false;
  }

  /**
   * Get connection state for a specific connection.
   */
  getConnectionState(connectionId: string): ConnectionState {
    const info = this.connections.get(connectionId);
    if (!info) {
      return { status: 'disconnected' };
    }
    return info.client.isConnected
      ? { status: 'connected' }
      : { status: 'disconnected' };
  }

  /**
   * Get total number of connections.
   */
  get connectionCount(): number {
    return this.connections.size;
  }
}

// Singleton instance for app-wide connection management
export const sseConnectionManager = new SseConnectionManager();
