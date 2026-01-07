/**
 * Notification types for DroidCode.
 */

export type NotificationType = 'completion' | 'permission';

export interface CompletionNotificationOptions {
  sessionId: string;
  hostId: number;
  projectId: number;
  port: number;
  title?: string;
  body?: string;
  agent?: string;
}

export interface PermissionNotificationOptions {
  sessionId: string;
  hostId: number;
  projectId: number;
  messageId: string;
  permissionId: string;
  toolType: string;
  title: string;
}

export interface NotificationData {
  type: NotificationType;
  sessionId: string;
  hostId: number;
  projectId: number;
  messageId?: string;
  permissionId?: string;
  url: string;
}

// Notification action identifiers
export const NOTIFICATION_ACTIONS = {
  ACCEPT: 'accept',
  DENY: 'deny',
  VIEW: 'view',
} as const;

// Notification category identifiers
export const NOTIFICATION_CATEGORIES = {
  PERMISSION_REQUEST: 'permission-request',
  AGENT_COMPLETION: 'agent-completion',
} as const;
