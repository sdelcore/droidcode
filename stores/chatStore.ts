import { create } from 'zustand';
import { Alert } from 'react-native';
import type {
  MessageDto,
  MessagePartDto,
  ConnectionState,
  AgentType,
  ThinkingModeType,
  TodoDto,
  FileDiffDto,
  Permission,
  SseEvent,
  SlashCommand,
  QuestionRequest,
} from '@/types';
import { BUILT_IN_COMMANDS } from '@/types';
import { apiClient } from '@/services/api/apiClient';
import { sseConnectionManager } from '@/services/sse/sseConnectionManager';
import { EventQueue, SseEventEnvelope } from '@/services/sse/EventQueue';
import { healthMonitor } from '@/services/health';
import { chatLogger } from '@/services/debug';
import { useHostStore } from './hostStore';
import { useSessionStore } from './sessionStore';
import { useConfigStore } from './configStore';
import {
  showCompletionNotification,
  showPermissionNotification,
} from '@/services/notifications';
import { extractNetworkError, logNetworkError } from '@/services/errors';
import { sessionPreferencesRepository } from '@/services/db/repositories/sessionPreferencesRepository';

interface StreamingPart {
  id: string;
  type: string;
  content: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  toolStatus?: string;
  sequence: number;
}

interface ChatState {
  // Session info
  sessionId: string | null;
  hostId: number | null;
  projectId: number | null;
  port: number | null;  // Port for API calls (project port 4100+ or host port 4096)

  // Messages
  messages: MessageDto[];
  pendingUserMessageId: string | null;  // ID of optimistic user message awaiting server confirmation
  streamingMessage: MessageDto | null;
  streamingParts: Map<string, StreamingPart>;
  partSequence: number;
  _cachedStreamingPartsArray: MessagePartDto[] | null;  // Cache for sorted parts to avoid recalculation
  _cachedStreamingPartsMapSize: number;  // Track Map size to detect when cache is valid

  // Turn tracking
  isAssistantTurnActive: boolean;
  activeMessageIds: Set<string>;
  isSessionBusy: boolean;

  // Interrupt tracking
  wasInterrupted: boolean;
  interruptedMessageId: string | null;

  // UI state
  isLoading: boolean;
  isSending: boolean;
  isAwaitingResponse: boolean;  // True from message send until first assistant SSE event
  error: string | null;
  inputText: string;
  selectedAgent: AgentType;
  thinkingMode: ThinkingModeType;

  // Connection
  connectionState: ConnectionState;

  // Features
  todos: TodoDto[];
  isTodosLoading: boolean;
  diffs: FileDiffDto[];
  pendingPermission: Permission | null;
  pendingQuestion: QuestionRequest | null;
  questionAnswers: (string[] | null)[];  // Answers for each question (null = unanswered)
  availableCommands: SlashCommand[];  // Slash commands from server + built-in

  // Internal cleanup functions (not exposed to components)
  _connectionId: string | null;  // Current SSE connection ID for sseConnectionManager
  _unsubscribeConnection: (() => void) | null;
  _unsubscribeEvents: (() => void) | null;
  _responseTimeoutId: ReturnType<typeof setTimeout> | null;  // For timeout cleanup
  _deltaQueue: EventQueue | null;  // Queue for batching delta events
  _healthMonitorUnsubscribe: (() => void) | null;  // Health monitor subscription

  // Actions
  resetSession: () => void;
  loadSession: (hostId: number, projectId: number, sessionId: string, port: number) => Promise<void>;
  sendMessage: (text: string, images?: string[]) => Promise<void>;
  connect: (hostId: number, port?: number) => Promise<string | null>;  // Returns connectionId on success, null on failure
  disconnect: () => void;
  disconnectById: (connectionId: string) => void;  // Disconnect a specific connection (for cleanup)
  reconnect: () => Promise<void>;  // Retry connection after failure
  setInputText: (text: string) => void;
  setSelectedAgent: (agent: AgentType) => void;
  setThinkingMode: (mode: ThinkingModeType) => void;
  respondToPermission: (permissionId: string, response: 'accept' | 'accept_always' | 'deny', message?: string) => Promise<void>;
  // Question tool actions
  setQuestionAnswer: (questionIndex: number, selectedLabels: string[]) => void;
  submitQuestionAnswers: () => Promise<void>;
  rejectQuestion: () => Promise<void>;
  abortSession: () => Promise<void>;
  clearError: () => void;
  clearInterruptedState: () => void;

  // Session management
  revertToMessage: (messageId: string) => Promise<void>;
  unrevert: () => Promise<void>;
  forkAtMessage: (messageId: string) => Promise<string | null>;
  canRedo: boolean;

  // Slash commands
  executeSlashCommand: (command: string, args?: string) => Promise<boolean>;
  clearMessages: () => void;
  summarizeSession: () => Promise<void>;
  fetchCommands: () => Promise<void>;

  // Todos
  fetchTodos: () => Promise<void>;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  // Initial state
  sessionId: null,
  hostId: null,
  projectId: null,
  port: null,
  messages: [],
  pendingUserMessageId: null,
  streamingMessage: null,
  streamingParts: new Map(),
  partSequence: 0,
  _cachedStreamingPartsArray: null,
  _cachedStreamingPartsMapSize: 0,
  isAssistantTurnActive: false,
  activeMessageIds: new Set(),
  isSessionBusy: false,
  wasInterrupted: false,
  interruptedMessageId: null,
  isLoading: false,
  isSending: false,
  isAwaitingResponse: false,
  error: null,
  inputText: '',
  selectedAgent: 'build',
  thinkingMode: 'normal',
  connectionState: { status: 'disconnected' },
  todos: [],
  isTodosLoading: false,
  diffs: [],
  pendingPermission: null,
  pendingQuestion: null,
  questionAnswers: [],
  availableCommands: BUILT_IN_COMMANDS,  // Start with built-in commands, fetch server commands later
  canRedo: false,
  _connectionId: null,
  _unsubscribeConnection: null,
  _unsubscribeEvents: null,
  _responseTimeoutId: null,
  _deltaQueue: null,
  _healthMonitorUnsubscribe: null,

  resetSession: () => {
    // Clean up any existing subscriptions and delta queue
    const { _connectionId, _unsubscribeConnection, _unsubscribeEvents, _responseTimeoutId, _deltaQueue, _healthMonitorUnsubscribe } = get();
    _unsubscribeConnection?.();
    _unsubscribeEvents?.();
    _deltaQueue?.clear();
    _healthMonitorUnsubscribe?.();

    // Clear response timeout if pending
    if (_responseTimeoutId) {
      clearTimeout(_responseTimeoutId);
    }

    // Stop health monitoring
    healthMonitor.stop();

    // Disconnect from SSE via connection manager
    if (_connectionId) {
      sseConnectionManager.disconnect(_connectionId, false);
    }

    // Reset all session state to initial values
    set({
      sessionId: null,
      hostId: null,
      projectId: null,
      port: null,
      messages: [],
      pendingUserMessageId: null,
      streamingMessage: null,
      streamingParts: new Map(),
      partSequence: 0,
      isAssistantTurnActive: false,
      activeMessageIds: new Set(),
      isSessionBusy: false,
      wasInterrupted: false,
      interruptedMessageId: null,
      isLoading: false,
      isSending: false,
      isAwaitingResponse: false,
      error: null,
      selectedAgent: 'build',
      thinkingMode: 'normal',
      todos: [],
      isTodosLoading: false,
      diffs: [],
      pendingPermission: null,
      availableCommands: BUILT_IN_COMMANDS,
      canRedo: false,
      _connectionId: null,
      _unsubscribeConnection: null,
      _unsubscribeEvents: null,
      _responseTimeoutId: null,
      _deltaQueue: null,
      _healthMonitorUnsubscribe: null,
    });
  },

  loadSession: async (hostId, projectId, sessionId, port) => {
    // Reset all previous session state before loading new session
    get().resetSession();

    // Port is REQUIRED - fail loudly if not provided
    if (!port) {
      const errorMsg = 'Cannot load session: port is required but was not provided.';
      console.error('[chatStore.loadSession]', errorMsg);
      set({ error: errorMsg, isLoading: false });
      return;
    }

    chatLogger.info(`Loading session: ${sessionId} for project ${projectId} on port ${port}`);
    set({ isLoading: true, error: null, hostId, projectId, sessionId, port });

    try {
      const rawMessages = await apiClient.getMessages(hostId, sessionId, undefined, port);
      // Consolidate consecutive assistant messages into single messages
      const messages = consolidateMessages(rawMessages);
      chatLogger.info(`Loaded ${messages.length} messages`);
      set({ messages, isLoading: false });

      // Load saved preferences for this session
      try {
        const prefs = await sessionPreferencesRepository.get(sessionId);
        if (prefs) {
          chatLogger.info(`Loaded preferences: agent=${prefs.selectedAgent}, thinking=${prefs.thinkingMode}`);
          set({
            selectedAgent: prefs.selectedAgent,
            thinkingMode: prefs.thinkingMode,
            inputText: prefs.inputText || '',
          });
        } else {
          chatLogger.info('No saved preferences, using defaults');
        }
      } catch (error) {
        // Don't fail the entire session load if preferences fail
        console.warn('Failed to load session preferences:', error);
      }

      // Load model preference for this session (override or global default)
      try {
        await useConfigStore.getState().loadSessionOverride(hostId, sessionId);
        chatLogger.info('Loaded model preference for session');
      } catch (error) {
        console.warn('Failed to load model preference:', error);
      }

      // Fetch available slash commands from server (non-blocking)
      get().fetchCommands();

      // Fetch todos for this session (non-blocking)
      get().fetchTodos();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load session';
      chatLogger.error(`Load session failed: ${message}`);
      set({ error: message, isLoading: false });
    }
  },

  sendMessage: async (text, images) => {
    const { hostId, sessionId, port, selectedAgent, thinkingMode, messages } = get();

    if (!hostId || !sessionId || !port) {
      const missing = [];
      if (!hostId) missing.push('hostId');
      if (!sessionId) missing.push('sessionId');
      if (!port) missing.push('port');
      const errorMsg = `Cannot send message: missing ${missing.join(', ')}. Please go back and reload the session.`;
      console.error('[chatStore.sendMessage]', errorMsg);
      set({ error: errorMsg });
      return;
    }

    // Create optimistic user message immediately
    // Use timestamp + random suffix to ensure unique IDs even with rapid sends
    // Include both text and image parts
    const parts: MessagePartDto[] = [{ type: 'text', text }];

    // Add image parts if provided
    if (images && images.length > 0) {
      for (const dataUrl of images) {
        // Parse mime type from data URL (format: data:mimeType;base64,...)
        const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        const mime = mimeMatch?.[1] || 'image/jpeg';
        parts.push({
          type: 'file',
          mime,
          url: dataUrl,
        });
      }
    }

    const userMessage: MessageDto = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      role: 'user',
      parts,
      agent: selectedAgent,
      timestamp: Date.now(),
    };

    set({
      isSending: true,
      isAwaitingResponse: true,
      error: null,
      messages: [...messages, userMessage],
      pendingUserMessageId: userMessage.id,  // Track for matching with server response
    });

    // Update session metadata immediately with selected agent (optimistic update for session list)
    if (sessionId && selectedAgent) {
      useSessionStore.getState().updateSessionAgent(sessionId, selectedAgent);
    }

    try {
      // Get selected model from configStore
      const selectedModel = useConfigStore.getState().getSelectedModelDto();

      await apiClient.sendMessage(hostId, sessionId, {
        text,
        agent: selectedAgent,
        thinkingMode,
        images,
        model: selectedModel || undefined,
      }, port ?? undefined);
      set({ isSending: false });

      // Add timeout protection: if no SSE response within timeout, show error
      // This prevents UI from being stuck in "awaiting" state if SSE fails silently
      // Use longer timeout for image uploads (90s) vs text-only messages (30s)
      const hasImages = images && images.length > 0;
      const responseTimeout = hasImages ? 90000 : 30000;
      
      // Capture the current session context to validate later
      const currentSessionId = sessionId;
      const currentHostId = hostId;
      
      const timeoutId = setTimeout(() => {
        const state = get();
        // Only show timeout error if we're still in the same session
        // This prevents stale timeout errors when switching sessions
        if (state.isAwaitingResponse && 
            state.sessionId === currentSessionId && 
            state.hostId === currentHostId) {
          console.warn(`[chatStore.sendMessage] No SSE response received after ${responseTimeout / 1000}s for session ${currentSessionId}`);
          set({
            isAwaitingResponse: false,
            error: 'No response received. The connection may have been lost. Try refreshing.',
            pendingUserMessageId: null,  // Clear pending ID on timeout
            _responseTimeoutId: null,
          });
        } else if (state.sessionId !== currentSessionId) {
          // Session has changed, just clear the timeout reference silently
          console.log(`[chatStore.sendMessage] Ignoring timeout for previous session ${currentSessionId}, now in session ${state.sessionId}`);
        }
      }, responseTimeout);

      // Store timeout ID for cleanup
      set({ _responseTimeoutId: timeoutId });
    } catch (error: unknown) {
      // Remove optimistic message on error
      const currentMessages = get().messages;
      const filteredMessages = currentMessages.filter(m => m.id !== userMessage.id);

      // Extract comprehensive error information
      const errorInfo = extractNetworkError(error);

      // Enhanced logging with full context for debugging
      const axiosError = error as { response?: { status?: number }; config?: { url?: string }; isTimeout?: boolean };
      const status = axiosError?.response?.status;
      const isTimeout = axiosError?.isTimeout === true;
      console.error('[chatStore.sendMessage] Failed:', {
        sessionId,
        port,
        hostId,
        status,
        isTimeout,
        url: axiosError?.config?.url,
        error: errorInfo.userMessage,
      });

      // Also use the standard error logger
      logNetworkError('chatStore.sendMessage', error, errorInfo);

      let errorMessage: string;
      const hasImages = images && images.length > 0;
      if (isTimeout) {
        errorMessage = hasImages
          ? 'Request timed out. The image may be too large, or your connection is slow. Try sending a smaller image.'
          : 'Request timed out. Check your network connection and try again.';
      } else if (status === 413) {
        errorMessage = 'Image is too large. The server rejected the request. Try sending a smaller photo or reducing the image quality.';
      } else if (status === 400 || status === 404) {
        errorMessage = 'Session may no longer exist. Please go back and refresh the session list.';
      } else {
        errorMessage = errorInfo.userMessage;
      }

      set({
        error: errorMessage,
        isSending: false,
        isAwaitingResponse: false,
        messages: filteredMessages,
        pendingUserMessageId: null,  // Clear pending ID on error
      });
    }
  },

  connect: async (hostId, port) => {
    // Clean up any existing subscriptions first
    const { _connectionId, _unsubscribeConnection, _unsubscribeEvents, _deltaQueue } = get();
    _unsubscribeConnection?.();
    _unsubscribeEvents?.();
    _deltaQueue?.clear();

    // Disconnect previous connection if exists
    if (_connectionId) {
      sseConnectionManager.disconnect(_connectionId, false);
    }

    const host = useHostStore.getState().hosts.find((h) => h.id === hostId);
    if (!host) {
      console.error('[chatStore.connect] Host not found:', hostId);
      return null;
    }

    // Use provided port or fall back to host's default port
    const actualPort = port ?? host.port;
    const url = `${host.isSecure ? 'https' : 'http'}://${host.host}:${actualPort}`;

    // Create unique connection ID for this session
    const { sessionId } = get();
    const connectionId = `chat-${sessionId ?? 'unknown'}-${Date.now()}`;

    // Subscribe to connection state changes (filter by connectionId)
    const unsubscribeConnection = sseConnectionManager.onConnectionStateChange((connId, state) => {
      if (connId === connectionId) {
        set({ connectionState: state });
      }
    });

    // Create EventQueue for batching delta events (~60fps)
    // Increased batch size for better performance during heavy streaming
    // Processes up to 15 delta events per batch, with 20ms delay (~50fps refresh rate)
    const deltaQueue = new EventQueue({ batchSize: 15, batchDelayMs: 20 });
    deltaQueue.setProcessor((envelope: SseEventEnvelope) => {
      handleSseEvent(envelope.payload as SseEvent, get, set);
    });

    // Subscribe to SSE events (filter by connectionId)
    // Route delta events through queue for batching, process others immediately
    const unsubscribeEvents = sseConnectionManager.onEvent((connId, event) => {
      if (connId === connectionId) {
        if (event.type === 'message.delta') {
          // Batch delta events for smoother UI updates
          deltaQueue.enqueue({
            eventId: `delta-${event.messageId}-${Date.now()}`,
            sessionId: event.sessionId || '',
            timestamp: Date.now(),
            type: event.type,
            payload: event,
          });
        } else {
          // Process high-priority events immediately (start, complete, permission, etc.)
          handleSseEvent(event, get, set);
        }
      }
    });

    // Capture current connection context for validation
    const currentSessionId = sessionId;
    const currentHostId = hostId;
    const currentPort = actualPort;
    
    // Subscribe to health monitor changes
    const healthMonitorUnsubscribe = healthMonitor.onHealthChange((healthState) => {
      const state = get();
      
      // Only process if we're still in the same session/connection
      if (state.sessionId !== currentSessionId || 
          state.hostId !== currentHostId || 
          state.port !== currentPort) {
        chatLogger.info(`Ignoring health update for previous session`);
        return;
      }

      if (healthState.status === 'unhealthy') {
        chatLogger.warn(`Health monitor detected unhealthy server: ${healthState.error}`);
        set({
          error: `Server connection lost. ${healthState.error || 'Please check your network connection.'}`,
          connectionState: {
            status: 'error',
            message: healthState.error || 'Server health check failed',
          },
        });
      } else if (healthState.status === 'healthy') {
        // Server is reachable again - check if we need to reconnect
        const currentConnState = state.connectionState;
        if (currentConnState.status === 'error' || currentConnState.status === 'disconnected') {
          chatLogger.info('Health recovered and connection is down - triggering reconnection');
          // Reset attempt counter and reconnect immediately
          if (state._connectionId) {
            sseConnectionManager.retryConnection(state._connectionId);
          }
        }
      }
    });

    // Store connection ID, queue, and unsubscribe functions for cleanup
    set({
      _connectionId: connectionId,
      _unsubscribeConnection: unsubscribeConnection,
      _unsubscribeEvents: unsubscribeEvents,
      _deltaQueue: deltaQueue,
      _healthMonitorUnsubscribe: healthMonitorUnsubscribe,
    });

    try {
      // Connect via connection manager (no timeout - waits until connected or error)
      await sseConnectionManager.connectAsync(connectionId, url);
      console.log(`[chatStore.connect] SSE connected successfully (${connectionId})`);
      return connectionId;  // Return connectionId for cleanup tracking
    } catch (error) {
      logNetworkError('chatStore.connect', error);
      set({
        connectionState: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to connect',
        },
      });
      return null;
    }
  },

  disconnect: () => {
    // Cleanup event subscriptions and delta queue
    const { _connectionId, _unsubscribeConnection, _unsubscribeEvents, _responseTimeoutId, _deltaQueue, _healthMonitorUnsubscribe } = get();
    _unsubscribeConnection?.();
    _unsubscribeEvents?.();
    _deltaQueue?.clear();
    _healthMonitorUnsubscribe?.();

    // Clear response timeout if pending
    if (_responseTimeoutId) {
      clearTimeout(_responseTimeoutId);
    }

    // Stop health monitoring
    healthMonitor.stop();

    // Disconnect via connection manager
    if (_connectionId) {
      sseConnectionManager.disconnect(_connectionId);
    }

    set({
      connectionState: { status: 'disconnected' },
      _connectionId: null,
      _unsubscribeConnection: null,
      _unsubscribeEvents: null,
      _responseTimeoutId: null,
      _deltaQueue: null,
      _healthMonitorUnsubscribe: null,
    });
  },

  // Disconnect a specific connection by ID - used for cleanup to avoid race conditions
  // when switching sessions. Only disconnects if the connectionId matches the current one.
  disconnectById: (connectionId: string) => {
    const { _connectionId, _unsubscribeConnection, _unsubscribeEvents, _responseTimeoutId, _deltaQueue, _healthMonitorUnsubscribe } = get();

    // Only cleanup if this is still the current connection
    // This prevents the race condition where old session cleanup disconnects new session
    if (_connectionId !== connectionId) {
      console.log(`[chatStore.disconnectById] Skipping stale cleanup (expected: ${connectionId}, current: ${_connectionId})`);
      return;
    }

    console.log(`[chatStore.disconnectById] Cleaning up connection ${connectionId}`);
    _unsubscribeConnection?.();
    _unsubscribeEvents?.();
    _deltaQueue?.clear();
    _healthMonitorUnsubscribe?.();

    if (_responseTimeoutId) {
      clearTimeout(_responseTimeoutId);
    }

    healthMonitor.stop();

    sseConnectionManager.disconnect(connectionId);

    set({
      connectionState: { status: 'disconnected' },
      _connectionId: null,
      _unsubscribeConnection: null,
      _unsubscribeEvents: null,
      _responseTimeoutId: null,
      _deltaQueue: null,
      _healthMonitorUnsubscribe: null,
    });
  },

  reconnect: async () => {
    const { hostId, port, sessionId, _connectionId } = get();
    
    if (!hostId || !sessionId) {
      chatLogger.warn('[chatStore.reconnect] Cannot reconnect: no active session');
      return;
    }

    chatLogger.info(`[chatStore.reconnect] Attempting to reconnect session ${sessionId}`);
    
    // If we have an existing connection, try to retry it first
    if (_connectionId) {
      sseConnectionManager.retryConnection(_connectionId);
    } else {
      // No existing connection, create a new one
      await get().connect(hostId, port ?? undefined);
    }
  },

  setInputText: async (text) => {
    set({ inputText: text });
    const { sessionId, hostId, selectedAgent, thinkingMode } = get();
    if (sessionId && hostId) {
      try {
        await sessionPreferencesRepository.upsert({
          sessionId,
          hostId,
          selectedAgent,
          thinkingMode,
          inputText: text,
        });
      } catch (error) {
        console.error('Failed to save input text preference:', error);
      }
    }
  },
  
  setSelectedAgent: async (agent) => {
    set({ selectedAgent: agent });
    const { sessionId, hostId, thinkingMode, inputText } = get();
    if (sessionId && hostId) {
      try {
        await sessionPreferencesRepository.upsert({
          sessionId,
          hostId,
          selectedAgent: agent,
          thinkingMode,
          inputText,
        });
      } catch (error) {
        console.error('Failed to save agent preference:', error);
      }
    }
  },
  
  setThinkingMode: async (mode) => {
    set({ thinkingMode: mode });
    const { sessionId, hostId, selectedAgent, inputText } = get();
    if (sessionId && hostId) {
      try {
        await sessionPreferencesRepository.upsert({
          sessionId,
          hostId,
          selectedAgent,
          thinkingMode: mode,
          inputText,
        });
      } catch (error) {
        console.error('Failed to save thinking mode preference:', error);
      }
    }
  },

  respondToPermission: async (permissionId, response, message) => {
    const { hostId, port } = get();
    if (!hostId) return;

    try {
      await apiClient.respondToPermission(hostId, permissionId, response, message, port ?? undefined);
      set({ pendingPermission: null });
    } catch (error) {
      console.error('Failed to respond to permission:', error);
      Alert.alert('Error', 'Failed to respond to permission. Please try again.');
    }
  },

  // Question tool actions
  setQuestionAnswer: (questionIndex, selectedLabels) => {
    const { questionAnswers } = get();
    const newAnswers = [...questionAnswers];
    newAnswers[questionIndex] = selectedLabels;
    set({ questionAnswers: newAnswers });
  },

  submitQuestionAnswers: async () => {
    const { hostId, port, pendingQuestion, questionAnswers } = get();
    if (!hostId || !pendingQuestion) return;

    try {
      // Filter out null answers and convert to the expected format
      const answers = questionAnswers.map((a) => a || []);
      await apiClient.replyToQuestion(hostId, pendingQuestion.id, answers, port ?? undefined);
      set({ pendingQuestion: null, questionAnswers: [] });
    } catch (error) {
      console.error('Failed to submit question answers:', error);
      Alert.alert('Error', 'Failed to submit answers. Please try again.');
    }
  },

  rejectQuestion: async () => {
    const { hostId, port, pendingQuestion } = get();
    if (!hostId || !pendingQuestion) return;

    try {
      await apiClient.rejectQuestion(hostId, pendingQuestion.id, port ?? undefined);
      set({ pendingQuestion: null, questionAnswers: [] });
    } catch (error) {
      console.error('Failed to reject question:', error);
      Alert.alert('Error', 'Failed to dismiss question. Please try again.');
    }
  },

  abortSession: async () => {
    const { hostId, sessionId, port, streamingMessage } = get();
    if (!hostId || !sessionId) return;

    // Optimistic UI: Set interrupted state immediately
    set({
      wasInterrupted: true,
      interruptedMessageId: streamingMessage?.id || null,
      isSessionBusy: false,
      isAssistantTurnActive: false,
    });

    try {
      await apiClient.abortSession(hostId, sessionId, port ?? undefined);
    } catch (error) {
      console.error('Failed to abort session:', error);
    }
  },

  clearError: () => set({ error: null }),

  clearInterruptedState: () => set({
    wasInterrupted: false,
    interruptedMessageId: null,
  }),

  revertToMessage: async (messageId) => {
    const { hostId, sessionId, port, messages } = get();
    if (!hostId || !sessionId) return;

    try {
      await apiClient.revertSession(hostId, sessionId, messageId, port ?? undefined);

      // Find message index and remove all messages after it
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex !== -1) {
        const newMessages = messages.slice(0, messageIndex + 1);
        set({ messages: newMessages, canRedo: true });
      }
    } catch (error) {
      console.error('Failed to revert session:', error);
      const message = error instanceof Error ? error.message : 'Failed to revert';
      set({ error: message });
    }
  },

  unrevert: async () => {
    const { hostId, sessionId, port } = get();
    if (!hostId || !sessionId) return;

    try {
      await apiClient.unrevertSession(hostId, sessionId, port ?? undefined);
      // Reload messages to get the restored state
      const messages = await apiClient.getMessages(hostId, sessionId, undefined, port ?? undefined);
      set({ messages, canRedo: false });
    } catch (error) {
      console.error('Failed to unrevert session:', error);
      const message = error instanceof Error ? error.message : 'Failed to unrevert';
      set({ error: message });
    }
  },

  forkAtMessage: async (messageId) => {
    const { hostId, sessionId, port } = get();
    if (!hostId || !sessionId) return null;

    try {
      const newSessionId = await apiClient.forkSession(hostId, sessionId, messageId, port ?? undefined);
      return newSessionId;
    } catch (error) {
      console.error('Failed to fork session:', error);
      const message = error instanceof Error ? error.message : 'Failed to fork';
      set({ error: message });
      return null;
    }
  },

  executeSlashCommand: async (command, args) => {
    const { hostId, sessionId, port, messages, revertToMessage, unrevert } = get();
    if (!hostId || !sessionId) return false;

    const normalizedCommand = command.toLowerCase().replace(/^\//, '');

    switch (normalizedCommand) {
      case 'undo': {
        // Revert to the previous assistant message
        const assistantMessages = messages.filter((m) => m.role === 'assistant');
        if (assistantMessages.length > 0) {
          const lastAssistant = assistantMessages[assistantMessages.length - 1];
          await revertToMessage(lastAssistant.id);
        }
        return true;
      }

      case 'redo': {
        await unrevert();
        return true;
      }

      case 'compact':
      case 'summarize': {
        await get().summarizeSession();
        return true;
      }

      case 'clear': {
        get().clearMessages();
        return true;
      }

      default: {
        // Try to execute via API for custom commands
        try {
          await apiClient.executeCommand(hostId, sessionId, normalizedCommand, args, port ?? undefined);
          return true;
        } catch (error) {
          console.error('Failed to execute command:', error);
          return false;
        }
      }
    }
  },

  clearMessages: () => {
    set({
      messages: [],
      streamingMessage: null,
      streamingParts: new Map(),
      todos: [],
      diffs: [],
    });
  },

  summarizeSession: async () => {
    const { hostId, sessionId, port } = get();
    if (!hostId || !sessionId) return;

    try {
      await apiClient.summarizeSession(hostId, sessionId, port ?? undefined);
    } catch (error) {
      console.error('Failed to summarize session:', error);
      const message = error instanceof Error ? error.message : 'Failed to summarize';
      set({ error: message });
    }
  },

  fetchCommands: async () => {
    const { hostId, port } = get();
    if (!hostId) return;

    try {
      const serverCommands = await apiClient.getCommands(hostId, port ?? undefined);

      // Convert server commands to SlashCommand format and merge with built-in
      const serverSlashCommands: SlashCommand[] = serverCommands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        isBuiltIn: false,
      }));

      // Merge: server commands take precedence, then add any built-in commands not from server
      const commandNames = new Set(serverSlashCommands.map((c) => c.name));
      const mergedCommands = [
        ...serverSlashCommands,
        ...BUILT_IN_COMMANDS.filter((c) => !commandNames.has(c.name)),
      ];

      set({ availableCommands: mergedCommands });
      chatLogger.info(`Loaded ${mergedCommands.length} slash commands (${serverSlashCommands.length} from server)`);
    } catch (error) {
      // Silently fall back to built-in commands on error
      console.warn('Failed to fetch commands from server, using built-in commands:', error);
      set({ availableCommands: BUILT_IN_COMMANDS });
    }
  },

  fetchTodos: async () => {
    const { hostId, sessionId, port } = get();
    if (!hostId || !sessionId || !port) {
      chatLogger.warn('Cannot fetch todos: missing hostId, sessionId, or port');
      return;
    }

    set({ isTodosLoading: true });

    try {
      const todos = await apiClient.getTodos(hostId, sessionId, port);
      // Ensure todos is always an array even if something unexpected happens
      const safeTodos = Array.isArray(todos) ? todos : [];
      chatLogger.info(`Fetched ${safeTodos.length} todos for session ${sessionId}`);
      set({ todos: safeTodos, isTodosLoading: false });
    } catch (error) {
      // Non-blocking error - todos are nice-to-have, not critical
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      chatLogger.warn(`Failed to fetch todos: ${errorMsg}`);
      set({ todos: [], isTodosLoading: false });
      // Don't set error state - this is a non-critical failure
    }
  },
}));

/**
 * Consolidate consecutive assistant messages into single messages.
 * This handles the case where the server returns multiple message records
 * for what should logically be a single assistant response.
 */
function consolidateMessages(messages: MessageDto[]): MessageDto[] {
  if (messages.length === 0) return messages;

  const consolidated: MessageDto[] = [];

  for (const message of messages) {
    const lastMessage = consolidated[consolidated.length - 1];

    // Merge consecutive assistant messages
    if (
      lastMessage &&
      lastMessage.role === 'assistant' &&
      message.role === 'assistant'
    ) {
      // Merge parts into the last assistant message
      const mergedMessage: MessageDto = {
        ...lastMessage,
        parts: [...lastMessage.parts, ...message.parts],
        // Keep the original agent if same, otherwise use first available
        agent: lastMessage.agent === message.agent
          ? lastMessage.agent
          : lastMessage.agent || message.agent,
        // Keep the latest timestamp
        timestamp: Math.max(lastMessage.timestamp, message.timestamp),
      };
      consolidated[consolidated.length - 1] = mergedMessage;
    } else {
      // Different roles or first message, add as new
      consolidated.push(message);
    }
  }

  return consolidated;
}

// Handle incoming SSE events
function handleSseEvent(
  event: SseEvent,
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
) {
  const { sessionId } = get();

  // Guard: Don't process ANY events if no session is loaded
  // This prevents stale events from a previous session from modifying state
  // during session transitions when sessionId is temporarily null
  if (!sessionId) {
    chatLogger.debug(`FILTERED event (no active session) - type: ${event.type}`);
    return;
  }

  // This indicates the connection is still active and receiving events

  switch (event.type) {
    case 'message.start':
      if (event.sessionId !== sessionId) {
        chatLogger.warn(`FILTERED message.start - session mismatch (event: ${event.sessionId}, store: ${sessionId})`);
        return;
      }
      handleMessageStart(event, get, set);

      // Update session metadata with agent (use selectedAgent as fallback)
      const agentToUse = event.agent || get().selectedAgent;
      if (agentToUse) {
        useSessionStore.getState().updateSessionAgent(event.sessionId, agentToUse as AgentType);
      }
      break;

    case 'message.delta':
      if (event.sessionId !== sessionId) {
        chatLogger.warn(`FILTERED message.delta - session mismatch`);
        return;
      }
      handleMessageDelta(event, get, set);
      break;

    case 'message.complete':
      if (event.sessionId !== sessionId) {
        chatLogger.warn(`FILTERED message.complete - session mismatch`);
        return;
      }
      handleMessageComplete(event, get, set);
      break;

    case 'session.updated':
      // Forward to sessionStore for centralized session lifecycle management
      // Per-session SSE sends flat format: { sessionId, title }
      // Global SSE sends full format: { info: SessionDto }
      useSessionStore.getState().handleGlobalSessionEvent(event);
      break;

    case 'todo.updated':
      if (event.sessionId !== sessionId) return;
      set({ todos: event.todos });
      break;

    case 'session.diff':
      if (event.sessionId !== sessionId) return;
      set({ diffs: event.files });
      break;

    case 'permission.requested':
      if (event.sessionId !== sessionId) return;
      set({
        pendingPermission: {
          id: event.permissionId,
          sessionId: event.sessionId,
          messageId: event.messageId,
          toolType: event.toolType,
          title: event.title,
          metadata: event.metadata,
          createdAt: Date.now(),
        },
      });
      // Show permission notification
      const { hostId: permHostId, projectId: permProjectId } = get();
      if (permHostId && permProjectId) {
        showPermissionNotification({
          sessionId: event.sessionId,
          hostId: permHostId,
          projectId: permProjectId,
          messageId: event.messageId,
          permissionId: event.permissionId,
          toolType: event.toolType,
          title: event.title,
        });
      }
      break;

    case 'permission.replied':
      // Clear pending permission when it has been responded to (locally or from another client)
      if (event.sessionId !== sessionId) return;
      const { pendingPermission } = get();
      if (pendingPermission && pendingPermission.id === event.permissionId) {
        set({ pendingPermission: null });
      }
      break;

    case 'question.asked':
      if (event.sessionId !== sessionId) return;
      // Initialize answers array with nulls for each question
      set({
        pendingQuestion: {
          id: event.requestId,
          sessionId: event.sessionId,
          questions: event.questions,
          tool: event.tool,
        },
        questionAnswers: new Array(event.questions.length).fill(null),
      });
      break;

    case 'question.replied':
    case 'question.rejected':
      // Clear pending question when answered/rejected (locally or from another client)
      if (event.sessionId !== sessionId) return;
      const { pendingQuestion } = get();
      if (pendingQuestion && pendingQuestion.id === event.requestId) {
        set({ pendingQuestion: null, questionAnswers: [] });
      }
      break;

    case 'session.status': {
      if (event.sessionId !== sessionId) return;
      const wasSessionBusy = get().isSessionBusy;
      const isNowIdle = event.status === 'idle';
      const isBusy = event.status === 'busy';
      
      chatLogger.info(
        `[session.status] Received status event for ${sessionId}: ${event.status} (was: ${wasSessionBusy ? 'busy' : 'idle'})`
      );
      
      set({ isSessionBusy: isBusy });

      // When session becomes idle, check if assistant turn should end
      // This handles the race condition where message.complete arrives before session.status
      if (isNowIdle) {
        const { activeMessageIds, streamingMessage, isAssistantTurnActive } = get();
        const hasNoActiveMessages = activeMessageIds.size === 0 && !streamingMessage;
        
        if (hasNoActiveMessages && isAssistantTurnActive) {
          chatLogger.info(
            `[session.status] Session idle with no active messages - ending assistant turn`
          );
          set({ isAssistantTurnActive: false });
        }
      }

      // Update session metadata with busy status
      useSessionStore.getState().updateSessionStatus(event.sessionId, isBusy);

      // Show completion notification when session transitions from busy to idle
      if (wasSessionBusy && isNowIdle) {
        const { hostId: compHostId, projectId: compProjectId, port: compPort, streamingMessage } = get();
        if (compHostId && compProjectId && compPort) {
          showCompletionNotification({
            sessionId: event.sessionId,
            hostId: compHostId,
            projectId: compProjectId,
            port: compPort,
            agent: streamingMessage?.agent,
          });
        }
      }
      break;
    }

    case 'error':
      set({ error: event.message });
      break;
  }
}

function handleMessageStart(
  event: { messageId: string; role: string; agent?: string },
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
) {
  const { activeMessageIds, messages, pendingUserMessageId } = get();

  chatLogger.info(`Message start: ${event.role} (id: ${event.messageId.slice(0, 8)}...)`);

  // For user messages: check if we have a tracked pending optimistic message
  // This prevents the server's echoed user message from creating duplicates
  if (event.role === 'user') {
    // Match against the specific pending user message ID (not just any 'user-' prefix)
    if (pendingUserMessageId) {
      const optimisticMessage = messages.find(m => m.id === pendingUserMessageId);

      if (optimisticMessage) {
        // Update the optimistic message's ID to match server's ID, but keep role as 'user'
        const updatedMessages = messages.map(m =>
          m.id === pendingUserMessageId
            ? { ...m, id: event.messageId }
            : m
        );
        set({
          messages: updatedMessages,
          activeMessageIds: new Set([...activeMessageIds, event.messageId]),
          pendingUserMessageId: null,  // Clear the pending ID after matching
        });
        return;  // Don't create a streamingMessage for user messages we already have
      }
    }
  }

  // Create streaming message
  // Use selectedAgent as fallback when server doesn't provide agent in message.start
  const streamingMessage: MessageDto = {
    id: event.messageId,
    role: event.role as 'user' | 'assistant',
    parts: [],
    agent: event.agent || get().selectedAgent,
    timestamp: Date.now(),
  };

  // Clear response timeout when assistant starts responding
  if (event.role === 'assistant') {
    const { _responseTimeoutId, hostId, port } = get();
    if (_responseTimeoutId) {
      clearTimeout(_responseTimeoutId);
    }

    // Start health monitoring when assistant begins streaming
    if (hostId && port) {
      healthMonitor.start(hostId, port);
      chatLogger.debug('Started health monitoring during assistant streaming');
    }
  }

  set({
    streamingMessage,
    streamingParts: new Map(),
    partSequence: 0,
    isAssistantTurnActive: event.role === 'assistant',
    // Reset isAwaitingResponse when assistant starts responding
    isAwaitingResponse: event.role === 'assistant' ? false : get().isAwaitingResponse,
    activeMessageIds: new Set([...activeMessageIds, event.messageId]),
    // Clear timeout ID when assistant responds
    _responseTimeoutId: event.role === 'assistant' ? null : get()._responseTimeoutId,
  });
}

function handleMessageDelta(
  event: {
    messageId: string;
    partId: string;
    partType: string;
    content: string;
    toolName?: string;
    toolInput?: string;
    toolOutput?: string;
    toolStatus?: string;
  },
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
) {
  let { streamingMessage, streamingParts, partSequence } = get();
  const { activeMessageIds } = get();

  // Fallback: If we receive a delta without a streaming message, auto-initialize
  // This handles the case where message.start was missed
  if (!streamingMessage || streamingMessage.id !== event.messageId) {
    if (!activeMessageIds.has(event.messageId)) {
      chatLogger.warn(`Auto-init streaming (missed message.start) - id: ${event.messageId.slice(0, 8)}...`);

      // Create streaming message as fallback
      const newStreamingMessage: MessageDto = {
        id: event.messageId,
        role: 'assistant',
        parts: [],
        timestamp: Date.now(),
      };

      const newActiveIds = new Set(activeMessageIds);
      newActiveIds.add(event.messageId);

      set({
        streamingMessage: newStreamingMessage,
        streamingParts: new Map(),
        partSequence: 0,
        isAssistantTurnActive: true,
        isAwaitingResponse: false,
        activeMessageIds: newActiveIds,
      });

      // Get fresh state after initialization
      const freshState = get();
      streamingMessage = freshState.streamingMessage;
      streamingParts = freshState.streamingParts;
      partSequence = freshState.partSequence;
    } else {
      // Message ID is tracked but streamingMessage doesn't match - log and skip
      chatLogger.warn(`Delta for tracked message but streamingMessage mismatch`);
      return;
    }
  }

  // Safety check after potential initialization
  if (!streamingMessage) {
    chatLogger.error(`streamingMessage still null after fallback`);
    return;
  }

  // Get existing part or create new one (immutably)
  const existingPart = streamingParts.get(event.partId);
  let updatedPart: StreamingPart;
  let newSequence = partSequence;

  if (!existingPart) {
    // Create new part
    updatedPart = {
      id: event.partId,
      type: event.partType,
      content: event.partType !== 'tool' ? event.content : '',
      sequence: partSequence,
      toolName: event.toolName,
      toolInput: event.toolInput,
      toolOutput: event.toolOutput,
      toolStatus: event.toolStatus,
    };
    newSequence = partSequence + 1;
  } else {
    // Create updated copy of existing part
    updatedPart = {
      ...existingPart,
      content: event.partType === 'tool'
        ? existingPart.content
        : existingPart.content + event.content,
      toolName: event.toolName ?? existingPart.toolName,
      toolInput: event.toolInput ?? existingPart.toolInput,
      toolOutput: event.toolOutput ?? existingPart.toolOutput,
      toolStatus: event.toolStatus ?? existingPart.toolStatus,
    };
  }

  // Create new Map with updated part
  const newStreamingParts = new Map(streamingParts);
  newStreamingParts.set(event.partId, updatedPart);

  // Convert streaming parts to message parts
  const sortedParts = Array.from(newStreamingParts.values())
    .sort((a, b) => a.sequence - b.sequence)
    .map((p) => ({
      type: p.type as any,
      text: p.type !== 'tool' ? p.content : undefined,
      tool: p.type === 'tool' ? p.toolName : undefined,
      toolName: p.toolName,
      state: p.type === 'tool'
        ? {
            status: p.toolStatus as any,
            input: p.toolInput,
            output: p.toolOutput,
          }
        : undefined,
    }));

  set({
    streamingMessage: {
      ...streamingMessage,
      parts: sortedParts,
    },
    streamingParts: newStreamingParts,
    partSequence: newSequence,
  });
}

function handleMessageComplete(
  event: { messageId: string },
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
) {
  const { streamingMessage, messages, activeMessageIds, isSessionBusy } = get();

  chatLogger.info(`Message complete: ${event.messageId.slice(0, 8)}...`);

  // Remove from active message IDs regardless of current state
  const newActiveIds = new Set(activeMessageIds);
  newActiveIds.delete(event.messageId);

  // Handle case where streamingMessage doesn't match (missed start/delta)
  if (!streamingMessage || streamingMessage.id !== event.messageId) {
    chatLogger.warn(`message.complete for non-streaming message`);

    // Still update activeMessageIds and check for turn completion
    const turnComplete = newActiveIds.size === 0 && !isSessionBusy;
    
    chatLogger.info(
      `[message.complete] Non-streaming turn check: activeIds=${newActiveIds.size}, ` +
      `busy=${isSessionBusy}, complete=${turnComplete}`
    );
    
    // Stop health monitoring if turn is complete
    if (turnComplete) {
      healthMonitor.stop();
      chatLogger.debug('Stopped health monitoring - non-streaming turn complete');
      
      // Optimistically set session to idle for non-streaming messages too
      const { sessionId } = get();
      if (sessionId) {
        chatLogger.debug(`[message.complete] Optimistically setting session ${sessionId} to idle (non-streaming)`);
        useSessionStore.getState().updateSessionStatus(sessionId, false);
        
        // Set a timeout to ensure we don't have a stuck busy state
        setTimeout(() => {
          const sessionMeta = useSessionStore.getState().getSessionMetadata(sessionId);
          if (sessionMeta?.isBusy) {
            chatLogger.warn(
              `[message.complete] Session ${sessionId} still busy after 3s timeout (non-streaming), forcing idle`
            );
            useSessionStore.getState().updateSessionStatus(sessionId, false);
          }
        }, 3000);
      }
    }
    
    set({
      activeMessageIds: newActiveIds,
      isAssistantTurnActive: !turnComplete,
    });
    return;
  }

  // Check if turn is complete
  const turnComplete = newActiveIds.size === 0 && !isSessionBusy;
  
  chatLogger.info(
    `[message.complete] Turn check: activeIds=${newActiveIds.size}, ` +
    `busy=${isSessionBusy}, complete=${turnComplete}`
  );

  // Use consolidateMessages for consistency with loadSession
  const newMessages = consolidateMessages([...messages, streamingMessage]);

  // Stop health monitoring when streaming ends
  if (turnComplete) {
    healthMonitor.stop();
    chatLogger.debug('Stopped health monitoring - streaming complete');
    
    // Optimistically set session to idle to immediately update the UI
    const { sessionId } = get();
    if (sessionId) {
      chatLogger.debug(`[message.complete] Optimistically setting session ${sessionId} to idle`);
      useSessionStore.getState().updateSessionStatus(sessionId, false);
      
      // Set a timeout to ensure we don't have a stuck busy state if server event is missed
      setTimeout(() => {
        const sessionMeta = useSessionStore.getState().getSessionMetadata(sessionId);
        if (sessionMeta?.isBusy) {
          chatLogger.warn(
            `[message.complete] Session ${sessionId} still busy after 3s timeout, forcing idle`
          );
          useSessionStore.getState().updateSessionStatus(sessionId, false);
        }
      }, 3000); // 3 second timeout
    }
  }

  set({
    messages: newMessages,
    streamingMessage: null,
    streamingParts: new Map(),
    activeMessageIds: newActiveIds,
    isAssistantTurnActive: !turnComplete,
  });
}
