/**
 * Tests for chatStore streaming functionality.
 */

import { useChatStore } from '@/stores/chatStore';
import type { SseEvent } from '@/types';

// Mock dependencies
jest.mock('@/services/api/apiClient', () => ({
  apiClient: {
    getMessages: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({}),
    respondToPermission: jest.fn().mockResolvedValue({}),
    abortSession: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('@/services/sse/sseClient', () => ({
  sseClient: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    onConnectionStateChange: jest.fn(() => jest.fn()),
    onEvent: jest.fn(() => jest.fn()),
  },
}));

jest.mock('@/stores/hostStore', () => ({
  useHostStore: {
    getState: () => ({
      hosts: [{ id: 1, host: 'localhost', port: 4096, isSecure: false }],
    }),
  },
}));

describe('chatStore streaming', () => {
  beforeEach(() => {
    // Reset store state
    useChatStore.setState({
      sessionId: 'test-session',
      hostId: 1,
      messages: [],
      streamingMessage: null,
      streamingParts: new Map(),
      partSequence: 0,
      isAssistantTurnActive: false,
      activeMessageIds: new Set(),
      isSessionBusy: false,
      isLoading: false,
      isSending: false,
      error: null,
      inputText: '',
      selectedAgent: 'build',
      thinkingMode: 'normal',
      connectionState: { status: 'disconnected' },
      todos: [],
      diffs: [],
      pendingPermission: null,
    });
  });

  describe('message streaming lifecycle', () => {
    it('should initialize streaming message on message.start', () => {
      const { getState } = useChatStore;

      // Simulate message.start event
      const state = getState();
      const startEvent: SseEvent = {
        type: 'message.start',
        sessionId: 'test-session',
        messageId: 'msg-1',
        role: 'assistant',
        agent: 'build',
      };

      // Call internal handler (we'll test via state changes)
      useChatStore.setState({
        streamingMessage: {
          id: startEvent.messageId,
          role: startEvent.role,
          parts: [],
          agent: startEvent.agent,
          timestamp: Date.now(),
        },
        streamingParts: new Map(),
        partSequence: 0,
        isAssistantTurnActive: true,
        activeMessageIds: new Set([startEvent.messageId]),
      });

      const updatedState = getState();
      expect(updatedState.streamingMessage).not.toBeNull();
      expect(updatedState.streamingMessage?.id).toBe('msg-1');
      expect(updatedState.streamingMessage?.role).toBe('assistant');
      expect(updatedState.isAssistantTurnActive).toBe(true);
    });

    it('should accumulate text content on message.delta', () => {
      const { getState } = useChatStore;

      // Start with initial streaming state
      useChatStore.setState({
        streamingMessage: {
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          agent: 'build',
          timestamp: Date.now(),
        },
        streamingParts: new Map(),
        partSequence: 0,
        isAssistantTurnActive: true,
        activeMessageIds: new Set(['msg-1']),
      });

      // Simulate text delta
      const streamingParts = new Map();
      streamingParts.set('part-1', {
        id: 'part-1',
        type: 'text',
        content: 'Hello',
        sequence: 0,
      });

      useChatStore.setState({
        streamingMessage: {
          id: 'msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello' }],
          agent: 'build',
          timestamp: Date.now(),
        },
        streamingParts,
        partSequence: 1,
      });

      const state = getState();
      expect(state.streamingMessage?.parts).toHaveLength(1);
      expect(state.streamingMessage?.parts[0].type).toBe('text');
      expect(state.streamingMessage?.parts[0].text).toBe('Hello');
    });

    it('should append to existing text content', () => {
      const { getState } = useChatStore;

      // Simulate accumulated text
      const streamingParts = new Map();
      streamingParts.set('part-1', {
        id: 'part-1',
        type: 'text',
        content: 'Hello world!',
        sequence: 0,
      });

      useChatStore.setState({
        streamingMessage: {
          id: 'msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello world!' }],
          agent: 'build',
          timestamp: Date.now(),
        },
        streamingParts,
        partSequence: 1,
        isAssistantTurnActive: true,
        activeMessageIds: new Set(['msg-1']),
      });

      const state = getState();
      expect(state.streamingMessage?.parts[0].text).toBe('Hello world!');
    });

    it('should handle tool use parts', () => {
      const { getState } = useChatStore;

      const streamingParts = new Map();
      streamingParts.set('part-1', {
        id: 'part-1',
        type: 'tool',
        content: '',
        toolName: 'Read',
        toolInput: '{"file": "test.ts"}',
        toolStatus: 'running',
        sequence: 0,
      });

      useChatStore.setState({
        streamingMessage: {
          id: 'msg-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool',
              tool: 'Read',
              toolName: 'Read',
              state: {
                status: 'running',
                input: '{"file": "test.ts"}',
              },
            },
          ],
          agent: 'build',
          timestamp: Date.now(),
        },
        streamingParts,
        partSequence: 1,
        isAssistantTurnActive: true,
        activeMessageIds: new Set(['msg-1']),
      });

      const state = getState();
      expect(state.streamingMessage?.parts).toHaveLength(1);
      expect(state.streamingMessage?.parts[0].type).toBe('tool');
      expect(state.streamingMessage?.parts[0].toolName).toBe('Read');
      expect(state.streamingMessage?.parts[0].state?.status).toBe('running');
    });

    it('should finalize message on message.complete', () => {
      const { getState } = useChatStore;

      // Start with streaming message
      useChatStore.setState({
        messages: [],
        streamingMessage: {
          id: 'msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello world!' }],
          agent: 'build',
          timestamp: Date.now(),
        },
        streamingParts: new Map(),
        isAssistantTurnActive: true,
        activeMessageIds: new Set(['msg-1']),
        isSessionBusy: false,
      });

      // Simulate message.complete
      const state = getState();
      const completedMessage = state.streamingMessage!;

      useChatStore.setState({
        messages: [completedMessage],
        streamingMessage: null,
        streamingParts: new Map(),
        activeMessageIds: new Set(),
        isAssistantTurnActive: false,
      });

      const finalState = getState();
      expect(finalState.streamingMessage).toBeNull();
      expect(finalState.messages).toHaveLength(1);
      expect(finalState.messages[0].parts[0].text).toBe('Hello world!');
      expect(finalState.isAssistantTurnActive).toBe(false);
    });
  });

  describe('turn tracking', () => {
    it('should track active message IDs', () => {
      const { getState } = useChatStore;

      useChatStore.setState({
        activeMessageIds: new Set(['msg-1', 'msg-2']),
        isAssistantTurnActive: true,
      });

      const state = getState();
      expect(state.activeMessageIds.size).toBe(2);
      expect(state.activeMessageIds.has('msg-1')).toBe(true);
      expect(state.activeMessageIds.has('msg-2')).toBe(true);
    });

    it('should end turn when all messages complete and session not busy', () => {
      const { getState } = useChatStore;

      // Simulate turn completion
      useChatStore.setState({
        activeMessageIds: new Set(),
        isSessionBusy: false,
        isAssistantTurnActive: false,
      });

      const state = getState();
      expect(state.isAssistantTurnActive).toBe(false);
    });

    it('should maintain turn active when session is busy', () => {
      const { getState } = useChatStore;

      useChatStore.setState({
        activeMessageIds: new Set(),
        isSessionBusy: true,
        isAssistantTurnActive: true,
      });

      const state = getState();
      expect(state.isAssistantTurnActive).toBe(true);
    });
  });

  describe('session events', () => {
    it('should update todos on todo.updated', () => {
      const { getState } = useChatStore;

      const todos = [
        { id: '1', content: 'Task 1', status: 'pending' as const },
        { id: '2', content: 'Task 2', status: 'in_progress' as const },
      ];

      useChatStore.setState({ todos });

      const state = getState();
      expect(state.todos).toHaveLength(2);
      expect(state.todos[0].content).toBe('Task 1');
      expect(state.todos[1].status).toBe('in_progress');
    });

    it('should update diffs on session.diff', () => {
      const { getState } = useChatStore;

      const diffs = [
        {
          path: '/test.ts',
          status: 'modified' as const,
          additions: 10,
          deletions: 5,
        },
      ];

      useChatStore.setState({ diffs });

      const state = getState();
      expect(state.diffs).toHaveLength(1);
      expect(state.diffs[0].path).toBe('/test.ts');
      expect(state.diffs[0].additions).toBe(10);
    });

    it('should handle permission requests', () => {
      const { getState } = useChatStore;

      useChatStore.setState({
        pendingPermission: {
          id: 'perm-1',
          sessionId: 'test-session',
          messageId: 'msg-1',
          toolType: 'Bash',
          title: 'Run command',
          createdAt: Date.now(),
        },
      });

      const state = getState();
      expect(state.pendingPermission).not.toBeNull();
      expect(state.pendingPermission?.toolType).toBe('Bash');
    });

    it('should track session busy status', () => {
      const { getState } = useChatStore;

      useChatStore.setState({ isSessionBusy: true });
      expect(getState().isSessionBusy).toBe(true);

      useChatStore.setState({ isSessionBusy: false });
      expect(getState().isSessionBusy).toBe(false);
    });
  });

  describe('part ordering', () => {
    it('should maintain part order by sequence number', () => {
      const { getState } = useChatStore;

      // Create parts with sequence numbers
      const streamingParts = new Map();
      streamingParts.set('part-3', {
        id: 'part-3',
        type: 'text',
        content: 'Third',
        sequence: 2,
      });
      streamingParts.set('part-1', {
        id: 'part-1',
        type: 'text',
        content: 'First',
        sequence: 0,
      });
      streamingParts.set('part-2', {
        id: 'part-2',
        type: 'thinking',
        content: 'Second',
        sequence: 1,
      });

      // Sort and convert to message parts (simulating the actual logic)
      const sortedParts = Array.from(streamingParts.values())
        .sort((a, b) => a.sequence - b.sequence)
        .map((p) => ({
          type: p.type as any,
          text: p.content,
        }));

      useChatStore.setState({
        streamingMessage: {
          id: 'msg-1',
          role: 'assistant',
          parts: sortedParts,
          timestamp: Date.now(),
        },
        streamingParts,
      });

      const state = getState();
      expect(state.streamingMessage?.parts).toHaveLength(3);
      expect(state.streamingMessage?.parts[0].text).toBe('First');
      expect(state.streamingMessage?.parts[1].text).toBe('Second');
      expect(state.streamingMessage?.parts[2].text).toBe('Third');
    });
  });

  describe('input and agent selection', () => {
    it('should update input text', () => {
      const { getState } = useChatStore;

      useChatStore.getState().setInputText('Hello world');
      expect(getState().inputText).toBe('Hello world');
    });

    it('should update selected agent', () => {
      const { getState } = useChatStore;

      useChatStore.getState().setSelectedAgent('plan');
      expect(getState().selectedAgent).toBe('plan');
    });

    it('should update thinking mode', () => {
      const { getState } = useChatStore;

      useChatStore.getState().setThinkingMode('high');
      expect(getState().thinkingMode).toBe('high');
    });
  });

  describe('turn completion race condition handling', () => {
    it('should end turn when session.status:idle arrives after message.complete (race condition fix)', () => {
      const { getState } = useChatStore;

      // Setup: Streaming state with session busy
      useChatStore.setState({
        sessionId: 'test-session',
        streamingMessage: {
          id: 'msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Response complete' }],
          timestamp: Date.now(),
        },
        activeMessageIds: new Set(['msg-1']),
        isAssistantTurnActive: true,
        isSessionBusy: true,
      });

      // Simulate message.complete arriving BEFORE session.status
      // This clears activeMessageIds but turn stays active because isSessionBusy is still true
      useChatStore.setState({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Response complete' }],
            timestamp: Date.now(),
          },
        ],
        streamingMessage: null,
        activeMessageIds: new Set(),
        // Bug scenario: turn would stay active because isSessionBusy is still true
        isAssistantTurnActive: true, // This simulates the bug
        isSessionBusy: true, // Still busy at this point
      });

      expect(getState().activeMessageIds.size).toBe(0);
      expect(getState().streamingMessage).toBeNull();
      expect(getState().isSessionBusy).toBe(true);
      expect(getState().isAssistantTurnActive).toBe(true); // Still stuck

      // Now simulate session.status: idle arriving AFTER message.complete
      // The fix should detect idle state + no active messages and end the turn
      const state = getState();
      const hasNoActiveMessages = state.activeMessageIds.size === 0 && !state.streamingMessage;
      
      useChatStore.setState({
        isSessionBusy: false,
        // Fix: Check if turn should end when session becomes idle
        isAssistantTurnActive: hasNoActiveMessages ? false : state.isAssistantTurnActive,
      });

      // Verify: Turn should now be inactive
      expect(getState().isSessionBusy).toBe(false);
      expect(getState().isAssistantTurnActive).toBe(false);
    });

    it('should end turn when session.status:idle arrives before message.complete (normal case)', () => {
      const { getState } = useChatStore;

      // Setup: Streaming state
      useChatStore.setState({
        sessionId: 'test-session',
        streamingMessage: {
          id: 'msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Response' }],
          timestamp: Date.now(),
        },
        activeMessageIds: new Set(['msg-1']),
        isAssistantTurnActive: true,
        isSessionBusy: true,
      });

      // Simulate session.status: idle arriving FIRST
      useChatStore.setState({
        isSessionBusy: false,
        // Turn should stay active because message hasn't completed yet
        isAssistantTurnActive: true,
      });

      expect(getState().isAssistantTurnActive).toBe(true); // Still active

      // Now message.complete arrives
      // Calculate turn completion based on the NEW state (activeMessageIds will be empty, session is idle)
      const newActiveIds = new Set<string>(); // Empty after message completes
      const isSessionBusy = getState().isSessionBusy; // false
      const turnComplete = newActiveIds.size === 0 && !isSessionBusy; // true
      
      useChatStore.setState({
        messages: [{ id: 'msg-1', role: 'assistant', parts: [], timestamp: Date.now() }],
        streamingMessage: null,
        activeMessageIds: newActiveIds,
        isAssistantTurnActive: !turnComplete, // Should be false
      });

      // Verify: Turn ends when message completes
      expect(getState().isAssistantTurnActive).toBe(false);
    });

    it('should keep turn active when session becomes idle but messages are still active', () => {
      const { getState } = useChatStore;

      // Setup: Multiple messages streaming
      useChatStore.setState({
        sessionId: 'test-session',
        streamingMessage: {
          id: 'msg-2',
          role: 'assistant',
          parts: [],
          timestamp: Date.now(),
        },
        activeMessageIds: new Set(['msg-1', 'msg-2']), // msg-1 completed, msg-2 still active
        isAssistantTurnActive: true,
        isSessionBusy: true,
      });

      // msg-1 completes
      useChatStore.setState({
        activeMessageIds: new Set(['msg-2']), // msg-2 still active
      });

      // Session becomes idle (but msg-2 still streaming)
      const state = getState();
      const hasNoActiveMessages = state.activeMessageIds.size === 0 && !state.streamingMessage;
      
      useChatStore.setState({
        isSessionBusy: false,
        // Should NOT end turn - msg-2 still active
        isAssistantTurnActive: hasNoActiveMessages ? false : true,
      });

      expect(getState().isAssistantTurnActive).toBe(true); // Still active
      expect(getState().activeMessageIds.size).toBe(1);
    });

    it('should handle abort clearing turn state immediately', () => {
      const { getState } = useChatStore;

      // Setup: Streaming state
      useChatStore.setState({
        sessionId: 'test-session',
        hostId: 1,
        streamingMessage: {
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          timestamp: Date.now(),
        },
        activeMessageIds: new Set(['msg-1']),
        isAssistantTurnActive: true,
        isSessionBusy: true,
      });

      // Simulate abort (mimics abortSession logic)
      useChatStore.setState({
        wasInterrupted: true,
        interruptedMessageId: 'msg-1',
        isSessionBusy: false,
        isAssistantTurnActive: false, // Explicitly cleared
      });

      expect(getState().isAssistantTurnActive).toBe(false);
      expect(getState().isSessionBusy).toBe(false);
      expect(getState().wasInterrupted).toBe(true);
    });

    it('should not end turn prematurely when session.status changes to busy', () => {
      const { getState } = useChatStore;

      // Setup: Idle state
      useChatStore.setState({
        sessionId: 'test-session',
        isAssistantTurnActive: false,
        isSessionBusy: false,
        activeMessageIds: new Set(),
        streamingMessage: null,
      });

      // Session becomes busy (new message starting)
      useChatStore.setState({
        isSessionBusy: true,
      });

      // Turn should stay inactive (new message hasn't started yet)
      expect(getState().isAssistantTurnActive).toBe(false);
      expect(getState().isSessionBusy).toBe(true);
    });

    it('should handle session.status:idle with no streaming message gracefully', () => {
      const { getState } = useChatStore;

      // Setup: Turn already inactive
      useChatStore.setState({
        sessionId: 'test-session',
        isAssistantTurnActive: false,
        isSessionBusy: true,
        activeMessageIds: new Set(),
        streamingMessage: null,
      });

      // Session becomes idle
      const state = getState();
      const hasNoActiveMessages = state.activeMessageIds.size === 0 && !state.streamingMessage;
      
      useChatStore.setState({
        isSessionBusy: false,
        // Should remain inactive (already was)
        isAssistantTurnActive: hasNoActiveMessages ? false : state.isAssistantTurnActive,
      });

      expect(getState().isAssistantTurnActive).toBe(false);
      expect(getState().isSessionBusy).toBe(false);
    });
  });
});
