/**
 * MessageProcessor - Processes SSE events into message state updates.
 *
 * Handles deduplication, session filtering, recovery from missed events,
 * and optimistic message matching.
 */

import { MessageDeduplicator } from './MessageDeduplicator';
import { StreamingMessageState } from './StreamingMessageState';
import type { SseEventEnvelope } from '../sse/EventQueue';
import type { MessageDto, TodoDto, FileDiffDto, Permission, QuestionRequest } from '@/types';

/**
 * Session events (non-message events).
 */
export type SessionEvent =
  | { type: 'todo.updated'; todos: TodoDto[] }
  | { type: 'session.diff'; files: FileDiffDto[] }
  | { type: 'session.status'; status: 'busy' | 'idle' }
  | { type: 'permission.requested'; permission: Permission }
  | { type: 'question.asked'; question: QuestionRequest }
  | { type: 'question.replied'; requestId: string }
  | { type: 'question.rejected'; requestId: string }
  | { type: 'session.updated'; title?: string }
  | { type: 'error'; message: string };

/**
 * Logger interface.
 */
export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
}

/**
 * Configuration for MessageProcessor.
 */
export interface MessageProcessorConfig {
  sessionId: string;
  onMessageUpdate: (message: MessageDto, isStreaming: boolean) => void;
  onMessageComplete: (message: MessageDto) => void;
  onSessionEvent: (event: SessionEvent) => void;
  logger: Logger;
}

// Event payload types
interface MessageStartPayload {
  messageId: string;
  role: string;
  agent?: string;
}

interface MessageDeltaPayload {
  messageId: string;
  partId: string;
  partType: string;
  content: string;
  toolName?: string;
  input?: string;
  output?: string;
  status?: string;
}

interface MessageCompletePayload {
  messageId: string;
}

/**
 * Processes SSE events into message state.
 */
export class MessageProcessor {
  private config: MessageProcessorConfig;
  private streamingMessages: Map<string, StreamingMessageState> = new Map();
  private deduplicator: MessageDeduplicator;
  private optimisticUserMessages: Set<string> = new Set();
  private completedMessageIds: Set<string> = new Set();

  constructor(config: MessageProcessorConfig) {
    this.config = config;
    this.deduplicator = new MessageDeduplicator({
      ttlMs: 60000,
      maxEntries: 500,
    });
  }

  /**
   * Get count of currently streaming messages.
   */
  get activeStreamingCount(): number {
    return this.streamingMessages.size;
  }

  /**
   * Track an optimistic user message for later matching.
   */
  trackOptimisticMessage(tempId: string): void {
    this.optimisticUserMessages.add(tempId);
  }

  /**
   * Process an SSE event envelope.
   */
  processEvent(envelope: SseEventEnvelope): void {
    // Filter by session
    if (envelope.sessionId !== this.config.sessionId) {
      this.config.logger.debug(
        `Filtered event for session ${envelope.sessionId}`
      );
      return;
    }

    // Route by event type
    switch (envelope.type) {
      case 'message.start':
      case 'message.started':
        this.handleMessageStart(envelope.payload as MessageStartPayload);
        break;
      case 'message.delta':
      case 'message.part.updated':
        this.handleMessageDelta(envelope.payload as MessageDeltaPayload);
        break;
      case 'message.complete':
      case 'message.completed':
        this.handleMessageComplete(envelope.payload as MessageCompletePayload);
        break;
      case 'session.status':
        this.handleSessionStatus(envelope.payload as { status: string });
        break;
      case 'todo.updated':
        this.handleTodoUpdated(envelope.payload as { todos: TodoDto[] });
        break;
      case 'session.diff.updated':
        this.handleSessionDiff(envelope.payload as { files: FileDiffDto[] });
        break;
      case 'permission.requested':
      case 'permission.updated':
        this.handlePermissionRequest(envelope.payload as any);
        break;
      case 'question.asked':
        this.handleQuestionAsked(envelope.payload as any);
        break;
      case 'question.replied':
        this.handleQuestionReplied(envelope.payload as any);
        break;
      case 'question.rejected':
        this.handleQuestionRejected(envelope.payload as any);
        break;
      case 'session.updated':
        this.handleSessionUpdated(envelope.payload as { title?: string });
        break;
      case 'error':
        this.handleError(envelope.payload as { message: string });
        break;
    }
  }

  private handleMessageStart(payload: MessageStartPayload): void {
    const { messageId, role, agent } = payload;

    // Check for duplicate
    if (this.deduplicator.isDuplicate(messageId, 'start')) {
      this.config.logger.debug(`Duplicate message.start for ${messageId}`);
      return;
    }
    this.deduplicator.mark(messageId, 'start');

    // Check if already completed
    if (this.completedMessageIds.has(messageId)) {
      this.config.logger.debug(
        `Ignoring late message.start for completed ${messageId}`
      );
      return;
    }

    // Handle optimistic user message matching
    if (role === 'user' && this.optimisticUserMessages.size > 0) {
      // Match and consume first optimistic message
      const firstOptimistic = this.optimisticUserMessages.values().next().value;
      if (firstOptimistic) {
        this.optimisticUserMessages.delete(firstOptimistic);
        this.config.logger.info(
          `Matched optimistic user message ${firstOptimistic} -> ${messageId}`
        );
        return; // Don't create streaming state for matched optimistic
      }
    }

    // Create streaming state
    const streamingState = new StreamingMessageState(
      messageId,
      this.config.sessionId,
      role as 'user' | 'assistant',
      agent
    );
    this.streamingMessages.set(messageId, streamingState);

    // Emit initial message
    this.config.onMessageUpdate(streamingState.toMessageDto(), true);
  }

  private handleMessageDelta(payload: MessageDeltaPayload): void {
    const { messageId, partId, partType, content, toolName, input, output, status } =
      payload;

    // Don't process deltas for completed messages
    if (this.completedMessageIds.has(messageId)) {
      this.config.logger.debug(
        `Ignoring delta for completed message ${messageId}`
      );
      return;
    }

    let streamingState = this.streamingMessages.get(messageId);

    // Auto-recover from missed message.start
    if (!streamingState) {
      this.config.logger.warn(
        `Auto-creating streaming state for ${messageId} (missed start)`
      );

      streamingState = new StreamingMessageState(
        messageId,
        this.config.sessionId,
        'assistant' // Default role
      );
      this.streamingMessages.set(messageId, streamingState);
    }

    // Add delta
    streamingState.addDelta(partId, partType, content, {
      name: toolName,
      status: status as any,
      input,
      output,
    });

    // Emit updated message
    this.config.onMessageUpdate(streamingState.toMessageDto(), true);
  }

  private handleMessageComplete(payload: MessageCompletePayload): void {
    const { messageId } = payload;

    // Mark as completed for deduplication
    this.completedMessageIds.add(messageId);

    // Clean up after delay
    setTimeout(() => {
      this.completedMessageIds.delete(messageId);
    }, 30000);

    // Handle case where we never saw this message (optimistic user message)
    const streamingState = this.streamingMessages.get(messageId);
    if (!streamingState) {
      this.config.logger.debug(
        `Complete event for unknown/optimistic message ${messageId}`
      );
      return;
    }

    // Finalize and emit
    const finalMessage = streamingState.toMessageDto();
    this.streamingMessages.delete(messageId);

    this.config.onMessageComplete(finalMessage);
  }

  private handleSessionStatus(payload: { status: string }): void {
    this.config.onSessionEvent({
      type: 'session.status',
      status: payload.status as 'busy' | 'idle',
    });
  }

  private handleTodoUpdated(payload: { todos: TodoDto[] }): void {
    this.config.onSessionEvent({
      type: 'todo.updated',
      todos: payload.todos,
    });
  }

  private handleSessionDiff(payload: { files: FileDiffDto[] }): void {
    this.config.onSessionEvent({
      type: 'session.diff',
      files: payload.files,
    });
  }

  private handlePermissionRequest(payload: any): void {
    this.config.onSessionEvent({
      type: 'permission.requested',
      permission: {
        id: payload.permissionId,
        sessionId: this.config.sessionId,
        messageId: payload.messageId,
        toolType: payload.toolType,
        title: payload.title,
        metadata: payload.metadata,
        createdAt: Date.now(),
      },
    });
  }

  private handleQuestionAsked(payload: any): void {
    this.config.onSessionEvent({
      type: 'question.asked',
      question: {
        id: payload.requestId,
        sessionId: this.config.sessionId,
        questions: payload.questions,
        tool: payload.tool,
      },
    });
  }

  private handleQuestionReplied(payload: any): void {
    this.config.onSessionEvent({
      type: 'question.replied',
      requestId: payload.requestId,
    });
  }

  private handleQuestionRejected(payload: any): void {
    this.config.onSessionEvent({
      type: 'question.rejected',
      requestId: payload.requestId,
    });
  }

  private handleSessionUpdated(payload: { title?: string }): void {
    this.config.onSessionEvent({
      type: 'session.updated',
      title: payload.title,
    });
  }

  private handleError(payload: { message: string }): void {
    this.config.onSessionEvent({
      type: 'error',
      message: payload.message,
    });
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.streamingMessages.clear();
    this.optimisticUserMessages.clear();
    this.completedMessageIds.clear();
    this.deduplicator.clear();
  }
}
