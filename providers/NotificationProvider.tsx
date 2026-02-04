/**
 * NotificationProvider - Handles notification permission requests and response listeners.
 * Manages deep linking from notification taps.
 */

import { useEffect, useRef, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import type { EventSubscription } from 'expo-modules-core';
import { router } from 'expo-router';

import {
  initializeNotifications,
  NotificationData,
  NOTIFICATION_ACTIONS,
} from '@/services/notifications';
import { apiClient } from '@/services/api/apiClient';
import type { PermissionResponse } from '@/types';

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);
  const lastResponseIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Initialize notifications on mount
    initializeNotifications();

    // Handle notification received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Notifications] Received:', notification.request.identifier);
      }
    );

    // Handle notification tap / action button press
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        // Dedupe responses
        if (response.notification.request.identifier === lastResponseIdRef.current) {
          return;
        }
        lastResponseIdRef.current = response.notification.request.identifier;

        await handleNotificationResponse(response);
      }
    );

    // Handle notification that opened the app from killed state
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && response.notification.request.identifier !== lastResponseIdRef.current) {
        lastResponseIdRef.current = response.notification.request.identifier;
        handleNotificationResponse(response);
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return <>{children}</>;
}

/**
 * Handle notification response (tap or action button).
 */
async function handleNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<void> {
  const rawData = response.notification.request.content.data;
  const data = rawData as unknown as NotificationData | undefined;

  if (!data) {
    console.log('[Notifications] No data in notification');
    return;
  }

  const actionId = response.actionIdentifier;

  console.log(`[Notifications] Response action: ${actionId}, type: ${data.type}`);

  // Handle permission action buttons
  if (data.type === 'permission' && data.permissionId) {
    if (actionId === NOTIFICATION_ACTIONS.ACCEPT) {
      await handlePermissionAction(data, 'accept');
      return;
    } else if (actionId === NOTIFICATION_ACTIONS.DENY) {
      await handlePermissionAction(data, 'deny');
      return;
    }
  }

  // Default: navigate to the session
  if (data.url) {
    console.log(`[Notifications] Navigating to: ${data.url}`);
    router.push(data.url as any);
  }
}

/**
 * Handle permission Accept/Deny action from notification.
 */
async function handlePermissionAction(
  data: NotificationData,
  action: PermissionResponse
): Promise<void> {
  if (!data.permissionId) {
    console.error('[Notifications] No permissionId in data');
    return;
  }

  try {
    console.log(`[Notifications] Responding to permission: ${action}`);
    await apiClient.respondToPermission(
      data.hostId,
      data.permissionId,
      action,
      undefined, // No message for notification actions
      undefined  // No port override
    );
    console.log('[Notifications] Permission response sent');

    // Dismiss the notification
    const notifications = await Notifications.getPresentedNotificationsAsync();
    for (const n of notifications) {
      const nRawData = n.request.content.data;
      const nData = nRawData as unknown as NotificationData | undefined;
      if (nData?.permissionId === data.permissionId) {
        await Notifications.dismissNotificationAsync(n.request.identifier);
      }
    }
  } catch (error) {
    console.error('[Notifications] Failed to respond to permission:', error);
    // Navigate to session so user can respond manually
    if (data.url) {
      router.push(data.url as any);
    }
  }
}

/**
 * Hook to check if notifications are enabled.
 */
export function useNotificationPermission() {
  const checkPermission = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  };

  const requestPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  };

  return { checkPermission, requestPermission };
}
