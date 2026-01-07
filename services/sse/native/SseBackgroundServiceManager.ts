/**
 * High-level manager for the Android foreground service.
 * Handles service lifecycle based on SSE connection state.
 */
import { Platform } from 'react-native';
import { SseServiceModule } from './SseServiceModule';

class SseBackgroundServiceManager {
  private _isServiceActive = false;

  /**
   * Whether the foreground service is currently active.
   * Use this to check if SSE connections should be kept alive on background.
   */
  get isServiceActive(): boolean {
    return this._isServiceActive;
  }

  /**
   * Start the foreground service if not already running.
   * Called when SSE connections are established.
   */
  startIfNeeded(connectionCount: number): void {
    if (Platform.OS !== 'android' || !SseServiceModule) {
      return;
    }

    if (!this._isServiceActive && connectionCount > 0) {
      console.log('[SseBackgroundService] Starting foreground service');
      SseServiceModule.startService(connectionCount);
      this._isServiceActive = true;
    }
  }

  /**
   * Stop the foreground service if no connections remain.
   * Called when all SSE connections are closed.
   */
  stopIfNoConnections(connectionCount: number): void {
    if (Platform.OS !== 'android' || !SseServiceModule) {
      return;
    }

    if (this._isServiceActive && connectionCount === 0) {
      console.log('[SseBackgroundService] Stopping foreground service - no connections');
      SseServiceModule.stopService();
      this._isServiceActive = false;
    }
  }

  /**
   * Force stop the foreground service.
   */
  stop(): void {
    if (Platform.OS !== 'android' || !SseServiceModule) {
      return;
    }

    if (this._isServiceActive) {
      console.log('[SseBackgroundService] Force stopping foreground service');
      SseServiceModule.stopService();
      this._isServiceActive = false;
    }
  }

  /**
   * Update the connection count displayed in the notification.
   */
  updateConnectionCount(count: number): void {
    if (Platform.OS !== 'android' || !SseServiceModule) {
      return;
    }

    if (this._isServiceActive) {
      SseServiceModule.updateConnectionCount(count);
    }
  }

  /**
   * Check if the native service is currently running.
   * This queries the native layer directly.
   */
  async isRunning(): Promise<boolean> {
    if (Platform.OS !== 'android' || !SseServiceModule) {
      return false;
    }

    try {
      return await SseServiceModule.isServiceRunning();
    } catch (error) {
      console.error('[SseBackgroundService] Error checking service status:', error);
      return false;
    }
  }

  /**
   * Sync the local state with the native service state.
   * Useful on app startup to recover state.
   */
  async syncState(): Promise<void> {
    if (Platform.OS !== 'android' || !SseServiceModule) {
      return;
    }

    try {
      this._isServiceActive = await SseServiceModule.isServiceRunning();
      console.log('[SseBackgroundService] Synced state:', this._isServiceActive);
    } catch (error) {
      console.error('[SseBackgroundService] Error syncing state:', error);
      this._isServiceActive = false;
    }
  }
}

export const sseBackgroundServiceManager = new SseBackgroundServiceManager();
