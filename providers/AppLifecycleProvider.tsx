/**
 * AppLifecycleProvider - Tracks app foreground/background state.
 * Updates visibility store and manages SSE reconnection.
 * Also handles global SSE event notifications from all connected projects.
 */

import { useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useVisibilityStore } from '@/stores/visibilityStore';
import { sseClient } from '@/services/sse/sseClient';
import { sseConnectionManager } from '@/services/sse/sseConnectionManager';
import { sseBackgroundServiceManager } from '@/services/sse/native';
import { useProjectStore } from '@/stores/projectStore';
import { useSessionStore } from '@/stores/sessionStore';
import {
  showCompletionNotification,
  showPermissionNotification,
} from '@/services/notifications/notificationManager';
import type { SseEvent } from '@/types';

interface AppLifecycleProviderProps {
  children: ReactNode;
}

export function AppLifecycleProvider({ children }: AppLifecycleProviderProps) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const setAppForeground = useVisibilityStore((s) => s.setAppForeground);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      const isActive = nextState === 'active';

      console.log(`[Lifecycle] AppState: ${appStateRef.current} -> ${nextState}`);

      // Update visibility store
      setAppForeground(isActive);

      if (wasBackground && isActive) {
        // App came to foreground
        if (Platform.OS === 'android' && sseBackgroundServiceManager.isServiceActive) {
          // SSE connections stayed alive via foreground service
          console.log('[Lifecycle] App foregrounded - SSE already connected via service');
        } else {
          // Reconnect all SSE connections
          console.log('[Lifecycle] App foregrounded - reconnecting SSE');
          sseClient.reconnect();
          sseConnectionManager.reconnectAll();
        }
      } else if (nextState.match(/inactive|background/)) {
        // App went to background
        if (Platform.OS === 'android' && sseBackgroundServiceManager.isServiceActive) {
          // Foreground service keeps process alive - don't disconnect SSE
          console.log('[Lifecycle] App backgrounded - SSE kept alive by foreground service');
        } else {
          // Disconnect all SSE to save battery
          // preserveState=true keeps lastEventId for resume
          console.log('[Lifecycle] App backgrounded - disconnecting SSE');
          sseClient.disconnect(true);
          sseConnectionManager.disconnectAll(true);
        }
      }

      appStateRef.current = nextState;
    });

    // Set initial state
    setAppForeground(AppState.currentState === 'active');

    // Check if we need to reconnect on mount
    // This handles cases where the component remounts while the app is active
    // or when AppState events are missed during quick app switches
    if (AppState.currentState === 'active' && sseClient.currentBaseUrl && !sseClient.isConnected) {
      console.log('[Lifecycle] Mount-time SSE reconnect needed');
      sseClient.reconnect();
    }

    return () => {
      subscription.remove();
    };
  }, [setAppForeground]);

  // Global SSE event listener for notifications from all connected projects
  const sessionStatusRef = useRef<Map<string, 'busy' | 'idle'>>(new Map());
  const projects = useProjectStore((s) => s.projects);

  useEffect(() => {
    const unsubscribe = sseConnectionManager.onEvent((connectionId, event) => {
      handleGlobalSseEvent(connectionId, event, sessionStatusRef.current, projects);
    });

    return unsubscribe;
  }, [projects]);

  return <>{children}</>;
}

/**
 * Handle SSE events from any connected project for notifications.
 */
function handleGlobalSseEvent(
  connectionId: string,
  event: SseEvent,
  sessionStatus: Map<string, 'busy' | 'idle'>,
  projects: { id: number; hostId: number; port: number }[]
) {
  // Extract projectId from connectionId (format: "project-123" or "project-123-global")
  const projectIdMatch = connectionId.match(/^project-(\d+)(-global)?$/);
  if (!projectIdMatch) return;

  const projectId = parseInt(projectIdMatch[1], 10);
  const isGlobalConnection = !!projectIdMatch[2];
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;

  const hostId = project.hostId;

  // Forward session lifecycle events from global SSE to sessionStore
  if (isGlobalConnection) {
    if (event.type === 'session.created' || 
        event.type === 'session.updated' ||
        event.type === 'session.updated.global' || 
        event.type === 'session.deleted' ||
        event.type === 'session.status') {
      // Only forward if this is for the currently viewed project
      // Check if the event's project port matches sessionStore's currentPort
      const currentPort = useSessionStore.getState().currentPort;
      const eventProject = projects.find((p) => p.id === projectId);
      
      if (currentPort && eventProject) {
        const projectPort = eventProject.port;
        if (projectPort === currentPort) {
          console.log(`[AppLifecycle] Forwarding ${event.type} to sessionStore (project ${projectId})`);
          useSessionStore.getState().handleGlobalSessionEvent(event);
        }
      } else if (!currentPort) {
        // No project selected yet, still forward events (they'll be filtered in sessionStore)
        console.log(`[AppLifecycle] Forwarding ${event.type} to sessionStore (no port filter)`);
        useSessionStore.getState().handleGlobalSessionEvent(event);
      }
    }
    // Don't process other events from global connection for notifications
    return;
  }

  // Process per-session events for notifications
  switch (event.type) {
    case 'session.status': {
      const prevStatus = sessionStatus.get(event.sessionId);
      sessionStatus.set(event.sessionId, event.status);

      // Notify when task completes (busy -> idle transition)
      if (prevStatus === 'busy' && event.status === 'idle') {
        console.log(`[Notifications] Task completed on project ${projectId}, session ${event.sessionId}`);
        showCompletionNotification({
          sessionId: event.sessionId,
          hostId,
          projectId,
          port: project.port,
        });
      }
      break;
    }

    case 'permission.requested': {
      console.log(`[Notifications] Permission requested on project ${projectId}: ${event.toolType}`);
      showPermissionNotification({
        sessionId: event.sessionId,
        hostId,
        projectId,
        messageId: event.messageId,
        permissionId: event.permissionId,
        toolType: event.toolType,
        title: event.title,
      });
      break;
    }
  }
}

/**
 * Hook to get current app state.
 */
export function useAppState(): AppStateStatus {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return appStateRef.current;
}

/**
 * Hook that triggers callback when app comes to foreground.
 */
export function useOnForeground(callback: () => void) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      const isActive = nextState === 'active';

      if (wasBackground && isActive) {
        callback();
      }

      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, [callback]);
}

/**
 * Hook that triggers callback when app goes to background.
 */
export function useOnBackground(callback: () => void) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appStateRef.current === 'active';
      const isBackground = nextState.match(/inactive|background/);

      if (wasActive && isBackground) {
        callback();
      }

      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, [callback]);
}
