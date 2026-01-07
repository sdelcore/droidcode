/**
 * Notification manager for DroidCode.
 * Handles showing notifications for agent completions and permission requests.
 * Ported from: service/AgentNotificationManager.kt
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { CHANNELS, setupNotificationChannels } from './channels';
import {
  CompletionNotificationOptions,
  PermissionNotificationOptions,
  NotificationData,
  NOTIFICATION_ACTIONS,
  NOTIFICATION_CATEGORIES,
} from './types';
import { useVisibilityStore } from '@/stores/visibilityStore';
import { apiClient } from '@/services/api/apiClient';

// Set default notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Agents that should NOT trigger notifications (sub-agents).
 */
const SUB_AGENTS = ['general', 'explore'];

/**
 * Initialize the notification system.
 */
export async function initializeNotifications(): Promise<boolean> {
  // Only works on physical devices
  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications require a physical device');
    return false;
  }

  // Set up Android channels
  await setupNotificationChannels();

  // Set up notification categories with action buttons
  await setupNotificationCategories();

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') {
    console.log('[Notifications] Already have permission');
    return true;
  }

  // Request permission
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  if (status === 'granted') {
    console.log('[Notifications] Permission granted');
    return true;
  }

  console.log('[Notifications] Permission denied');
  return false;
}

/**
 * Set up notification categories with action buttons.
 */
async function setupNotificationCategories(): Promise<void> {
  // Permission request category with Accept/Deny buttons
  await Notifications.setNotificationCategoryAsync(
    NOTIFICATION_CATEGORIES.PERMISSION_REQUEST,
    [
      {
        identifier: NOTIFICATION_ACTIONS.ACCEPT,
        buttonTitle: 'Accept',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: NOTIFICATION_ACTIONS.DENY,
        buttonTitle: 'Deny',
        options: {
          opensAppToForeground: false,
          isDestructive: true,
        },
      },
    ]
  );

  // Agent completion category with View button
  await Notifications.setNotificationCategoryAsync(
    NOTIFICATION_CATEGORIES.AGENT_COMPLETION,
    [
      {
        identifier: NOTIFICATION_ACTIONS.VIEW,
        buttonTitle: 'View',
        options: {
          opensAppToForeground: true,
        },
      },
    ]
  );

  console.log('[Notifications] Categories configured');
}

/**
 * Build rich notification content for a completed session.
 * Returns null if the session is a child session (should not notify).
 */
async function buildCompletionNotification(
  sessionId: string,
  hostId: number,
  port: number,
  agent?: string
): Promise<{ title: string; body: string } | null> {
  try {
    // 1. Fetch session details to check if parent
    const session = await apiClient.getSession(hostId, sessionId, port);
    
    // 2. Filter out child sessions
    if (session.parentID) {
      console.log(`[Notifications] Skipping child session: ${sessionId}`);
      return null;
    }
    
    // 3. Build title from session title
    const title = session.title || 'Task Complete';
    
    // 4. Build rich context body
    const parts: string[] = [];
    
    // Add agent info
    if (agent && !SUB_AGENTS.includes(agent.toLowerCase())) {
      parts.push(`Agent: ${agent}`);
    }
    
    // Add file summary if available
    if (session.summary) {
      const { files, additions, deletions } = session.summary;
      if (files > 0) {
        parts.push(`${files} file${files !== 1 ? 's' : ''} changed (+${additions}, -${deletions})`);
      }
    }
    
    const body = parts.length > 0 ? parts.join(' • ') : 'Task completed successfully';
    
    return { title, body };
  } catch (error) {
    console.error('[Notifications] Failed to build notification content:', error);
    return null;
  }
}

/**
 * Show a completion notification when agent finishes.
 */
export async function showCompletionNotification(
  options: CompletionNotificationOptions
): Promise<string | null> {
  const { sessionId, hostId, projectId, port, agent } = options;

  // Skip sub-agents
  if (agent && SUB_AGENTS.includes(agent.toLowerCase())) {
    console.log(`[Notifications] Skipping sub-agent notification: ${agent}`);
    return null;
  }

  // Check if user is viewing this session
  const shouldNotify = useVisibilityStore.getState().shouldNotify(sessionId);
  if (!shouldNotify) {
    console.log('[Notifications] User viewing session, skipping notification');
    return null;
  }

  // Build rich notification content
  const content = await buildCompletionNotification(sessionId, hostId, port, agent);
  if (!content) {
    // Child session or API error - skip notification
    return null;
  }

  const { title, body } = content;

  const data: NotificationData = {
    type: 'completion',
    sessionId,
    hostId,
    projectId,
    url: `/sessions/${hostId}/${projectId}/${sessionId}`,
  };

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      categoryIdentifier: NOTIFICATION_CATEGORIES.AGENT_COMPLETION,
      data: data as unknown as Record<string, unknown>,
      ...(Platform.OS === 'android' && {
        channelId: CHANNELS.AGENT_COMPLETIONS,
      }),
    },
    trigger: null, // Show immediately
  });

  console.log(`[Notifications] Showed completion notification: ${notificationId}`);

  // Auto-dismiss after 30 seconds (like Kotlin version)
  setTimeout(() => {
    Notifications.dismissNotificationAsync(notificationId);
  }, 30000);

  return notificationId;
}

/**
 * Show a permission request notification.
 */
export async function showPermissionNotification(
  options: PermissionNotificationOptions
): Promise<string | null> {
  const { sessionId, hostId, projectId, messageId, permissionId, toolType, title } = options;

  // Check if user is viewing this session
  const shouldNotify = useVisibilityStore.getState().shouldNotify(sessionId);
  if (!shouldNotify) {
    console.log('[Notifications] User viewing session, skipping permission notification');
    return null;
  }

  const data: NotificationData = {
    type: 'permission',
    sessionId,
    hostId,
    projectId,
    messageId,
    permissionId,
    url: `/sessions/${hostId}/${projectId}/${sessionId}`,
  };

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Permission Required',
      body: title || `${toolType} requires permission`,
      categoryIdentifier: NOTIFICATION_CATEGORIES.PERMISSION_REQUEST,
      data: data as unknown as Record<string, unknown>,
      sticky: true, // Don't auto-dismiss
      ...(Platform.OS === 'android' && {
        channelId: CHANNELS.PERMISSION_REQUESTS,
      }),
    },
    trigger: null, // Show immediately
  });

  console.log(`[Notifications] Showed permission notification: ${notificationId}`);
  return notificationId;
}

/**
 * Cancel a permission notification (after user responds).
 */
export async function cancelPermissionNotification(notificationId: string): Promise<void> {
  await Notifications.dismissNotificationAsync(notificationId);
  console.log(`[Notifications] Cancelled notification: ${notificationId}`);
}

/**
 * Cancel all notifications for a session.
 */
export async function cancelSessionNotifications(sessionId: string): Promise<void> {
  const notifications = await Notifications.getPresentedNotificationsAsync();

  for (const notification of notifications) {
    const rawData = notification.request.content.data;
    const data = rawData as unknown as NotificationData | undefined;
    if (data?.sessionId === sessionId) {
      await Notifications.dismissNotificationAsync(notification.request.identifier);
    }
  }
}

/**
 * Cancel all notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}

/**
 * Get the badge count.
 */
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set the badge count.
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}
