/**
 * Android notification channel definitions.
 * Ported from: service/AgentNotificationManager.kt
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const CHANNELS = {
  PERMISSION_REQUESTS: 'permission-requests',
  AGENT_COMPLETIONS: 'agent-completions',
  SSE_SERVICE: 'sse-service',
} as const;

/**
 * Set up Android notification channels.
 * Must be called before showing any notifications.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  // Permission requests channel - MAX importance for urgent requests
  await Notifications.setNotificationChannelAsync(CHANNELS.PERMISSION_REQUESTS, {
    name: 'Permission Requests',
    importance: Notifications.AndroidImportance.MAX,
    description: 'Urgent permission requests from the AI agent',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B6B',
    enableVibrate: true,
    enableLights: true,
    bypassDnd: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  // Agent completions channel - HIGH importance
  await Notifications.setNotificationChannelAsync(CHANNELS.AGENT_COMPLETIONS, {
    name: 'Agent Completions',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Notifications when AI agents complete tasks',
    enableVibrate: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  // SSE service channel - LOW importance for persistent background service
  await Notifications.setNotificationChannelAsync(CHANNELS.SSE_SERVICE, {
    name: 'Background Connection',
    importance: Notifications.AndroidImportance.LOW,
    description: 'Keeps connections alive when app is in background',
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  console.log('[Notifications] Channels configured');
}

/**
 * Delete all notification channels (for cleanup/reset).
 */
export async function deleteNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.deleteNotificationChannelAsync(CHANNELS.PERMISSION_REQUESTS);
  await Notifications.deleteNotificationChannelAsync(CHANNELS.AGENT_COMPLETIONS);
  await Notifications.deleteNotificationChannelAsync(CHANNELS.SSE_SERVICE);
}
