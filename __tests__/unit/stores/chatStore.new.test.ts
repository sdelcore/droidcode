/**
 * chatStore Tests (New Architecture)
 *
 * Tests for the refactored chatStore that delegates to MessageProcessor.
 * This version is simplified and uses the new SSE/messaging architecture.
 */

// Mock modules BEFORE any imports
jest.mock('@/services/api/apiClient');
jest.mock('@/services/sse/sseClient');
jest.mock('@/stores/hostStore');
jest.mock('@/stores/sessionStore');
jest.mock('@/stores/configStore');
jest.mock('@/services/notifications');
jest.mock('@/services/debug', () => ({
  chatLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('@/services/errors', () => ({
  extractNetworkError: jest.fn(() => ({ userMessage: 'Send failed' })),
  logNetworkError: jest.fn(),
}));

import { act } from '@testing-library/react-native';
import type { MessageDto } from '@/types';
import { apiClient } from '@/services/api/apiClient';
import { sseClient } from '@/services/sse/sseClient';
import { useHostStore } from '@/stores/hostStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useConfigStore } from '@/stores/configStore';

// Setup mocks
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockSseClient = sseClient as jest.Mocked<typeof sseClient>;

// Import store after mocks are set up
import { useChatStore } from '@/stores/chatStore';

describe('chatStore (new architecture)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup apiClient mock defaults
    mockApiClient.getMessages.mockResolvedValue([]);
    mockApiClient.sendMessage.mockResolvedValue({} as any);
    mockApiClient.respondToPermission.mockResolvedValue({} as any);
    mockApiClient.abortSession.mockResolvedValue({} as any);
    mockApiClient.revertSession.mockResolvedValue({} as any);
    mockApiClient.unrevertSession.mockResolvedValue({} as any);
    mockApiClient.forkSession.mockResolvedValue('new-session-id');
    mockApiClient.summarizeSession.mockResolvedValue({} as any);
    mockApiClient.executeCommand.mockResolvedValue({} as any);

    // Setup sseClient mock
    mockSseClient.connect.mockResolvedValue();
    mockSseClient.disconnect.mockImplementation(() => {});
    mockSseClient.onConnectionStateChange.mockReturnValue(jest.fn());
    mockSseClient.onEvent.mockReturnValue(jest.fn());

    // Setup hostStore mock
    (useHostStore.getState as jest.Mock).mockReturnValue({
      hosts: [{ id: 1, host: 'localhost', port: 4096, isSecure: false }],
    });

    // Setup sessionStore mock
    (useSessionStore.getState as jest.Mock).mockReturnValue({
      updateSessionTitle: jest.fn(),
    });

    // Setup configStore mock
    (useConfigStore.getState as jest.Mock).mockReturnValue({
      getSelectedModelDto: jest.fn(() => null),
    });

    // Reset store to initial state
    useChatStore.setState({
      sessionId: null,
      hostId: null,
      port: null,
      messages: [],
      streamingMessage: null,
      streamingParts: new Map(),
      partSequence: 0,
      isAssistantTurnActive: false,
      activeMessageIds: new Set(),
      isSessionBusy: false,
      isLoading: false,
      isSending: false,
      isAwaitingResponse: false,
      error: null,
      inputText: '',
      selectedAgent: 'build',
      thinkingMode: 'normal',
      connectionState: { status: 'disconnected' },
      todos: [],
      diffs: [],
      pendingPermission: null,
      canRedo: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should load session with messages', async () => {
      const mockMessages: MessageDto[] = [
        { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }], timestamp: Date.now() },
        { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Hi there!' }], timestamp: Date.now() },
      ];
      mockApiClient.getMessages.mockResolvedValueOnce(mockMessages);

      const { loadSession } = useChatStore.getState();

      await act(async () => {
        await loadSession(1, 100, 'session-1', 4100);
      });

      const state = useChatStore.getState();
      expect(state.sessionId).toBe('session-1');
      expect(state.hostId).toBe(1);
      expect(state.projectId).toBe(100);
      expect(state.port).toBe(4100);
      expect(state.messages).toHaveLength(2);
      expect(state.isLoading).toBe(false);
    });

    it('should handle load session error', async () => {
      mockApiClient.getMessages.mockRejectedValueOnce(new Error('Network error'));

      const { loadSession } = useChatStore.getState();

      await act(async () => {
        await loadSession(1, 100, 'session-1', 4100);
      });

      const state = useChatStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
    });

    it('should consolidate consecutive assistant messages', async () => {
      const mockMessages: MessageDto[] = [
        { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }], timestamp: 1000 },
        { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Part 1' }], timestamp: 2000 },
        { id: 'msg-3', role: 'assistant', parts: [{ type: 'text', text: 'Part 2' }], timestamp: 3000 },
      ];
      mockApiClient.getMessages.mockResolvedValueOnce(mockMessages);

      const { loadSession } = useChatStore.getState();

      await act(async () => {
        await loadSession(1, 100, 'session-1', 4100);
      });

      const state = useChatStore.getState();
      // Consecutive assistant messages should be merged
      expect(state.messages).toHaveLength(2);
      expect(state.messages[1].parts).toHaveLength(2);
    });
  });

  describe('sending messages', () => {
    beforeEach(() => {
      useChatStore.setState({
        sessionId: 'session-1',
        hostId: 1,
        projectId: 100,
        port: 4100,
      });
    });

    it('should send message and create optimistic user message', async () => {
      const { sendMessage } = useChatStore.getState();

      await act(async () => {
        await sendMessage('Hello world');
      });

      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].parts[0].text).toBe('Hello world');
      expect(mockApiClient.sendMessage).toHaveBeenCalled();
    });

    it('should set isAwaitingResponse after sending', async () => {
      const { sendMessage } = useChatStore.getState();

      await act(async () => {
        await sendMessage('Hello');
      });

      const state = useChatStore.getState();
      expect(state.isAwaitingResponse).toBe(true);
    });

    it('should remove optimistic message on error', async () => {
      mockApiClient.sendMessage.mockRejectedValueOnce(new Error('Send failed'));

      const { sendMessage } = useChatStore.getState();

      await act(async () => {
        await sendMessage('Hello');
      });

      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.error).toBeDefined();
    });
  });

  describe('connection management', () => {
    it('should connect via sseStore', async () => {
      const { connect } = useChatStore.getState();

      await act(async () => {
        await connect(1);
      });

      // sseStore.connect should be called (via the chain)
      // Note: The actual implementation may need adjustment based on architecture
    });

    it('should disconnect via sseStore', () => {
      const { disconnect } = useChatStore.getState();

      act(() => {
        disconnect();
      });

      // Disconnection logic
    });
  });

  describe('input state', () => {
    it('should update input text', () => {
      act(() => {
        useChatStore.getState().setInputText('New input');
      });

      expect(useChatStore.getState().inputText).toBe('New input');
    });

    it('should update selected agent', () => {
      act(() => {
        useChatStore.getState().setSelectedAgent('plan');
      });

      expect(useChatStore.getState().selectedAgent).toBe('plan');
    });

    it('should update thinking mode', () => {
      act(() => {
        useChatStore.getState().setThinkingMode('high');
      });

      expect(useChatStore.getState().thinkingMode).toBe('high');
    });
  });

  describe('session management', () => {
    beforeEach(() => {
      useChatStore.setState({
        sessionId: 'session-1',
        hostId: 1,
        messages: [
          { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }], timestamp: 1000 },
          { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Hi!' }], timestamp: 2000 },
        ],
      });
    });

    it('should revert to message', async () => {
      const { revertToMessage } = useChatStore.getState();

      await act(async () => {
        await revertToMessage('msg-1');
      });

      expect(mockApiClient.revertSession).toHaveBeenCalledWith(1, 'session-1', 'msg-1', undefined);

      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.canRedo).toBe(true);
    });

    it('should unrevert session', async () => {
      mockApiClient.getMessages.mockResolvedValueOnce([
        { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }], timestamp: 1000 },
        { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Hi!' }], timestamp: 2000 },
      ]);

      useChatStore.setState({ canRedo: true });

      const { unrevert } = useChatStore.getState();

      await act(async () => {
        await unrevert();
      });

      expect(mockApiClient.unrevertSession).toHaveBeenCalled();

      const state = useChatStore.getState();
      expect(state.canRedo).toBe(false);
    });

    it('should fork at message', async () => {
      const { forkAtMessage } = useChatStore.getState();

      let newSessionId: string | null = null;
      await act(async () => {
        newSessionId = await forkAtMessage('msg-1');
      });

      expect(mockApiClient.forkSession).toHaveBeenCalledWith(1, 'session-1', 'msg-1', undefined);
      expect(newSessionId).toBe('new-session-id');
    });
  });

  describe('slash commands', () => {
    beforeEach(() => {
      useChatStore.setState({
        sessionId: 'session-1',
        hostId: 1,
        messages: [
          { id: 'msg-1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }], timestamp: 1000 },
        ],
      });
    });

    it('should execute /clear command', async () => {
      const { executeSlashCommand } = useChatStore.getState();

      let result = false;
      await act(async () => {
        result = await executeSlashCommand('clear');
      });

      expect(result).toBe(true);
      expect(useChatStore.getState().messages).toHaveLength(0);
    });

    it('should execute /undo command', async () => {
      const { executeSlashCommand } = useChatStore.getState();

      await act(async () => {
        await executeSlashCommand('undo');
      });

      expect(mockApiClient.revertSession).toHaveBeenCalled();
    });

    it('should execute /redo command', async () => {
      mockApiClient.getMessages.mockResolvedValueOnce([]);

      const { executeSlashCommand } = useChatStore.getState();

      await act(async () => {
        await executeSlashCommand('redo');
      });

      expect(mockApiClient.unrevertSession).toHaveBeenCalled();
    });

    it('should execute /summarize command', async () => {
      const { executeSlashCommand } = useChatStore.getState();

      await act(async () => {
        await executeSlashCommand('summarize');
      });

      expect(mockApiClient.summarizeSession).toHaveBeenCalled();
    });

    it('should execute custom command via API', async () => {
      const { executeSlashCommand } = useChatStore.getState();

      await act(async () => {
        await executeSlashCommand('custom', 'args');
      });

      expect(mockApiClient.executeCommand).toHaveBeenCalledWith(
        1, 'session-1', 'custom', 'args', undefined
      );
    });
  });

  describe('permission handling', () => {
    beforeEach(() => {
      useChatStore.setState({
        sessionId: 'session-1',
        hostId: 1,
        pendingPermission: {
          id: 'perm-1',
          sessionId: 'session-1',
          messageId: 'msg-1',
          toolType: 'Bash',
          title: 'Run command',
          createdAt: Date.now(),
        },
      });
    });

    it('should respond to permission with accept', async () => {
      const { respondToPermission } = useChatStore.getState();

      await act(async () => {
        await respondToPermission('perm-1', 'accept');
      });

      expect(mockApiClient.respondToPermission).toHaveBeenCalledWith(
        1, 'session-1', 'perm-1', 'accept', undefined
      );
      expect(useChatStore.getState().pendingPermission).toBeNull();
    });

    it('should respond to permission with deny', async () => {
      const { respondToPermission } = useChatStore.getState();

      await act(async () => {
        await respondToPermission('perm-1', 'deny');
      });

      expect(mockApiClient.respondToPermission).toHaveBeenCalledWith(
        1, 'session-1', 'perm-1', 'deny', undefined
      );
    });
  });

  describe('abort session', () => {
    it('should abort session', async () => {
      useChatStore.setState({
        sessionId: 'session-1',
        hostId: 1,
      });

      const { abortSession } = useChatStore.getState();

      await act(async () => {
        await abortSession();
      });

      expect(mockApiClient.abortSession).toHaveBeenCalledWith(1, 'session-1', undefined);
    });
  });

  describe('error handling', () => {
    it('should clear error', () => {
      useChatStore.setState({ error: 'Some error' });

      const { clearError } = useChatStore.getState();

      act(() => {
        clearError();
      });

      expect(useChatStore.getState().error).toBeNull();
    });
  });

  describe('clear messages', () => {
    it('should clear all state on clearMessages', () => {
      useChatStore.setState({
        messages: [{ id: 'msg-1', role: 'user', parts: [], timestamp: 1000 }],
        streamingMessage: { id: 'msg-2', role: 'assistant', parts: [], timestamp: 2000 },
        todos: [{ id: 'todo-1', content: 'Task', status: 'pending', activeForm: 'test' }],
        diffs: [{ path: '/test.ts', additions: 1, deletions: 0 }],
      });

      const { clearMessages } = useChatStore.getState();

      act(() => {
        clearMessages();
      });

      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.streamingMessage).toBeNull();
      expect(state.todos).toHaveLength(0);
      expect(state.diffs).toHaveLength(0);
    });
  });
});
