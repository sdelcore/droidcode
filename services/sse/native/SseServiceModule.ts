/**
 * TypeScript interface for the native SSE service module.
 * Only available on Android - returns null on other platforms.
 */
import { NativeModules, Platform } from 'react-native';

interface SseServiceModuleType {
  startService: (connectionCount: number) => void;
  stopService: () => void;
  updateConnectionCount: (count: number) => void;
  isServiceRunning: () => Promise<boolean>;
}

/**
 * Native module for controlling the Android foreground service.
 * Returns null on iOS (no-op).
 */
export const SseServiceModule: SseServiceModuleType | null =
  Platform.OS === 'android' ? NativeModules.SseServiceModule : null;
