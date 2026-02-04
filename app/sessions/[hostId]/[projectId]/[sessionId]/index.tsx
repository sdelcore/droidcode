/**
 * Chat screen for interacting with the AI agent.
 * Displays messages, handles streaming, and manages session state.
 */

import { useEffect, useRef, useCallback, useState, useMemo, forwardRef } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
  Platform,
  StatusBar,
  PixelRatio,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation, KeyboardStickyView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useHeaderHeight } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, Stack, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
import { Colors, Spacing, FontSize, BorderRadius, getAgentColor } from '@/constants/Theme';
import { useChatStore } from '@/stores/chatStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useConfigStore } from '@/stores/configStore';
import { apiClient } from '@/services/api/apiClient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  MessageGroup,
  ChatInput,
  ConnectionStatus,
  ConnectionDot,
  SessionHeader,
} from '@/components/chat';
import type { MessageGroup as MessageGroupType, ThinkingModeType } from '@/types';
import { TodoPanelCompact } from '@/components/panels';
import { PermissionBanner, QuestionBanner } from '@/components/dialogs';
import { SessionMenu } from '@/components/menus';
import { modelPreferencesRepository } from '@/services/db/repositories/modelPreferencesRepository';
import {
  ErrorBanner,
  EmptyState,
  LoadingSpinner,
  TypingIndicator,
  InterruptBanner,
  ScrollToBottomButton,
  StreamingIndicatorBar,
} from '@/components/feedback';

/**
 * Scroll component for FlashList that integrates with KeyboardAwareScrollView.
 * This ensures the message list adjusts its content inset when the keyboard opens.
 */
const RenderScrollComponent = forwardRef<any, any>((props, ref) => (
  <KeyboardAwareScrollView {...props} ref={ref} />
));

/**
 * Minimum height for Android gesture navigation area.
 * Modern Android devices with gesture navigation have an area at the bottom
 * that needs additional padding even when navigation bar is hidden.
 */
const ANDROID_GESTURE_AREA_MIN_HEIGHT = 20;

/**
 * Calculate Android navigation bar height for edge-to-edge mode.
 * Workaround for react-native-safe-area-context returning 0 for bottom inset
 * when edgeToEdgeEnabled is true.
 */
function getNavigationBarHeight(): number {
  if (Platform.OS !== 'android') return 0;
  
  const screen = Dimensions.get('screen');
  const window = Dimensions.get('window');
  const statusBarHeight = StatusBar.currentHeight || 0;
  
  // System bars height = screen height - window height
  // Navigation bar height = total system bars - status bar
  const navBarHeight = Math.max(0, (screen.height - window.height) - statusBarHeight);
  
  // Ensure minimum height for gesture navigation on Android 10+
  // This accounts for the gesture area that isn't included in navigation bar height
  return Math.max(navBarHeight, ANDROID_GESTURE_AREA_MIN_HEIGHT);
}

export default function ChatScreen() {
  const { hostId, projectId, sessionId } = useLocalSearchParams<{
    hostId: string;
    projectId: string;
    sessionId: string;
  }>();

  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  
  // Fix for edge-to-edge mode: SafeAreaProvider returns 0 for bottom inset
  // when edgeToEdgeEnabled is true, so we calculate it manually as a fallback
  const bottomInset = useMemo(() => {
    if (insets.bottom > 0) {
      // Safe area insets are working correctly, use them
      return insets.bottom;
    }
    // Fallback: Calculate navigation bar height manually (edge-to-edge mode)
    const calculatedHeight = getNavigationBarHeight();
    if (__DEV__) {
      console.log('[ChatScreen] Bottom inset fallback:', {
        'insets.bottom': insets.bottom,
        'calculated navigation bar height': calculatedHeight,
      });
    }
    return calculatedHeight;
  }, [insets.bottom]);
  const { projects, updateLastConnected: updateProjectLastConnected } = useProjectStore();
  const { sessions, childSessions, fetchChildSessions } = useSessionStore();
  const {
    providers,
    providerStatuses,
    selectedProvider,
    selectedModel,
    fetchProviders,
    fetchProviderStatuses,
    setSelectedModel,
  } = useConfigStore();
  const project = projects.find((p) => p.id === parseInt(projectId, 10));
  const currentSession = sessions.find((s) => s.id === sessionId);
  
  // Check if this is a child session by looking in all child session arrays
  let parentSessionId: string | null = null;
  if (sessionId) {
    // First check if currentSession has parentID
    if (currentSession?.parentID) {
      parentSessionId = currentSession.parentID;
    } else {
      // Search through all child session arrays to find if this session is a child
      for (const [parentId, children] of Object.entries(childSessions)) {
        if (children.some((child) => child.id === sessionId)) {
          parentSessionId = parentId;
          break;
        }
      }
    }
  }
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);

  const {
    messages,
    streamingMessage,
    isLoading,
    isSending,
    isAwaitingResponse,
    error,
    connectionState,
    inputText,
    selectedAgent,
    thinkingMode,
    todos,
    isTodosLoading,
    pendingPermission,
    pendingQuestion,
    questionAnswers,
    isAssistantTurnActive,
    isSessionBusy,
    setInputText,
    setSelectedAgent,
    setThinkingMode,
    sendMessage,
    connect,
    disconnectById,
    loadSession,
    respondToPermission,
    setQuestionAnswer,
    submitQuestionAnswers,
    rejectQuestion,
    abortSession,
    clearError,
    executeSlashCommand,
    revertToMessage,
    forkAtMessage,
    fetchTodos,
    wasInterrupted,
    interruptedMessageId,
    clearInterruptedState,
  } = useChatStore();

  const flatListRef = useRef<any>(null); // FlashList ref
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // User scroll tracking for improved auto-scroll behavior
  const [userHasScrolledAway, setUserHasScrolledAway] = useState(false);
  const scrollPositionRef = useRef({ offset: 0, contentHeight: 0 });
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create stable refs for store functions to prevent effect re-runs
  const connectRef = useRef(connect);
  const disconnectByIdRef = useRef(disconnectById);
  const loadSessionRef = useRef(loadSession);
  const updateProjectLastConnectedRef = useRef(updateProjectLastConnected);

  // Track the current connection ID for proper cleanup
  // This prevents the race condition where old session cleanup disconnects new session
  const activeConnectionIdRef = useRef<string | null>(null);

  // Keep refs updated
  useEffect(() => {
    connectRef.current = connect;
    disconnectByIdRef.current = disconnectById;
    loadSessionRef.current = loadSession;
    updateProjectLastConnectedRef.current = updateProjectLastConnected;
  });

  // Track keyboard visibility
  useAnimatedReaction(
    () => keyboardHeight.value,
    (height) => {
      runOnJS(setIsKeyboardVisible)(height > 0);
    },
    [keyboardHeight]
  );

  useEffect(() => {
    let mounted = true;
    // Capture connectionId for THIS effect run to prevent race condition
    // where old session cleanup disconnects new session's connection
    let connectionIdForCleanup: string | null = null;

    setIsSessionReady(false);  // Reset when dependencies change

    const initializeSession = async () => {
      if (!hostId || !sessionId || !project) return;

      const numericHostId = parseInt(hostId, 10);
      const projectPort = project.port;

      try {
        // Validate session exists on server before loading (use project's port)
        await apiClient.getSession(numericHostId, sessionId, projectPort);

        if (!mounted) return;

        // Session exists, proceed with loading
        // IMPORTANT: Must await to ensure sessionId is set in store before SSE connects
        const numericProjectId = parseInt(projectId, 10);
        await loadSessionRef.current(numericHostId, numericProjectId, sessionId, projectPort);

        if (!mounted) return;

        // Wait for SSE connection with proper error handling
        // connect() now returns the connectionId for targeted cleanup
        const connectionId = await connectRef.current(numericHostId, projectPort);

        if (!mounted) return;

        if (connectionId) {
          connectionIdForCleanup = connectionId;
          activeConnectionIdRef.current = connectionId;
        } else {
          console.warn('[Chat] SSE connection failed, continuing anyway');
        }

        // Update project last connected
        if (projectId) {
          updateProjectLastConnectedRef.current(parseInt(projectId, 10));
        }

        // Mark session as ready for interaction
        if (mounted) {
          setIsSessionReady(true);
        }
      } catch (err: unknown) {
        if (!mounted) return;

        const axiosErr = err as { response?: { status?: number } };
        const status = axiosErr?.response?.status;

        if (status === 404 || status === 400) {
          // Session no longer exists on server
          Alert.alert(
            'Session Not Found',
            'This session no longer exists on the server. It may have been deleted or the server was restarted.',
            [{ text: 'Go Back', onPress: () => router.back() }]
          );
        } else {
          // Other error - still try to load (might be network issue)
          console.error('[Chat] Failed to validate session:', err);
          const numericProjectId = parseInt(projectId, 10);
          await loadSessionRef.current(numericHostId, numericProjectId, sessionId, projectPort);
          if (!mounted) return;
          // Still try to connect even if validation failed
          connectRef.current(numericHostId, projectPort).then((connId) => {
            if (connId && mounted) {
              connectionIdForCleanup = connId;
              activeConnectionIdRef.current = connId;
            }
          }).catch((connectErr) => {
            console.error('[Chat] SSE connection also failed:', connectErr);
          });
          // Still mark as ready since we attempted initialization
          if (mounted) {
            setIsSessionReady(true);
          }
        }
      }
    };

    initializeSession();

    return () => {
      mounted = false;
      // Use disconnectById with the captured connectionId to prevent
      // race condition where this cleanup disconnects a newer session's connection
      if (connectionIdForCleanup) {
        disconnectByIdRef.current(connectionIdForCleanup);
      }
    };
  }, [hostId, projectId, sessionId, project?.port]);

  // Fetch providers and their connection status (use project's port)
  useEffect(() => {
    if (hostId && project) {
      const numericHostId = parseInt(hostId, 10);
      fetchProviders(numericHostId, project.port);
      fetchProviderStatuses(numericHostId, project.port);
    }
  }, [hostId, project?.port, fetchProviders, fetchProviderStatuses]);

  // Fetch child sessions on demand when session loads
  useEffect(() => {
    if (sessionId && project) {
      fetchChildSessions(sessionId, project.port);
    }
  }, [sessionId, project?.port, fetchChildSessions]);

  // Track scroll position to determine if user is at bottom
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    
    const currentOffset = contentOffset.y;
    const previousOffset = scrollPositionRef.current.offset;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    
    // User scrolled up (1px sensitivity) - immediately stop auto-scrolling
    if (currentOffset < previousOffset - 1) {
      setUserHasScrolledAway(true);
      setIsAtBottom(false);
    }
    // User scrolled to bottom (strict 20px threshold) - re-enable auto-scrolling
    else if (distanceFromBottom < 20) {
      setUserHasScrolledAway(false);
      setIsAtBottom(true);
    }
    
    // Update scroll position reference
    scrollPositionRef.current = {
      offset: currentOffset,
      contentHeight: contentSize.height,
    };
  }, []);

  // Track when user starts scrolling
  const handleScrollBeginDrag = useCallback(() => {
    isUserScrollingRef.current = true;
  }, []);

  // Track when user ends scrolling
  const handleScrollEndDrag = useCallback(() => {
    isUserScrollingRef.current = false;
  }, []);

  // Auto-scroll when content size changes (only if user is at bottom)
  // Debounced to reduce layout thrashing during rapid streaming
  const handleContentSizeChange = useCallback(() => {
    // Only auto-scroll if user hasn't scrolled away and isn't actively scrolling
    if (!userHasScrolledAway && !isUserScrollingRef.current && isAtBottom) {
      // Clear any pending scroll
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Debounce scroll by 50ms to batch rapid content changes
      scrollTimeoutRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        });
      }, 50);
    }
  }, [userHasScrolledAway, isAtBottom]);

  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive (only if user is at bottom)
  useEffect(() => {
    // Only auto-scroll if user is at bottom and hasn't scrolled away
    if ((messages.length > 0 || streamingMessage) && isAtBottom && !userHasScrolledAway) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messages.length, streamingMessage?.id, isAtBottom, userHasScrolledAway]);

  // Reconnect SSE when screen gains focus (handles missed AppState events)
  useFocusEffect(
    useCallback(() => {
      // Only reconnect if session was previously initialized
      // This prevents race condition on initial mount where useFocusEffect
      // fires before loadSession() has set the sessionId in the store
      if (!isSessionReady) return;

      if (hostId && project && connectionState.status === 'disconnected') {
        console.log('[Chat] Focus-time SSE reconnect needed');
        // Fire and forget for focus reconnection - don't block UI
        connect(parseInt(hostId, 10), project.port).catch((err) => {
          console.error('[Chat] Focus-time reconnect failed:', err);
        });
      }
    }, [hostId, project?.port, connectionState.status, connect, isSessionReady])
  );

  const handleSend = useCallback(
    (images?: string[]) => {
      if (!inputText.trim() && !images?.length) return;

      // Warn user if SSE is not connected
      if (connectionState.status !== 'connected') {
        Alert.alert(
          'Connection Issue',
          'Not connected to server. Your message will be sent but you may not see the response until reconnected. Continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Send Anyway',
              onPress: () => {
                sendMessage(inputText.trim(), images);
                setInputText('');
              },
            },
          ]
        );
        return;
      }

      sendMessage(inputText.trim(), images);
      setInputText('');
    },
    [inputText, sendMessage, setInputText, connectionState.status]
  );

  const handlePermissionRespond = useCallback(
    (permissionId: string, response: 'accept' | 'accept_always' | 'deny', message?: string) => {
      respondToPermission(permissionId, response, message);
    },
    [respondToPermission]
  );

  // Question handlers
  const handleQuestionAnswerChange = useCallback(
    (questionIndex: number, selectedLabels: string[]) => {
      setQuestionAnswer(questionIndex, selectedLabels);
    },
    [setQuestionAnswer]
  );

  const handleQuestionSubmit = useCallback(() => {
    submitQuestionAnswers();
  }, [submitQuestionAnswers]);

  const handleQuestionReject = useCallback(() => {
    rejectQuestion();
  }, [rejectQuestion]);

  const handleRevert = useCallback(
    (messageId: string) => {
      revertToMessage(messageId);
    },
    [revertToMessage]
  );

  const handleFork = useCallback(
    async (messageId: string) => {
      const newSessionId = await forkAtMessage(messageId);
      if (newSessionId) {
        // Navigate to the new forked session
        router.replace(`/sessions/${hostId}/${projectId}/${newSessionId}` as any);
      }
    },
    [forkAtMessage, hostId, projectId]
  );

  const handleJumpToBottom = useCallback(() => {
    setUserHasScrolledAway(false);
    setIsAtBottom(true);
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Create a hash for streaming content to minimize unnecessary re-renders
  // Only changes when streaming message parts actually change, not on every delta
  const streamingContentKey = useMemo(() => {
    if (!streamingMessage) return 'no-streaming';
    return `${streamingMessage.id}-${streamingMessage.parts.length}-${streamingMessage.parts[streamingMessage.parts.length - 1]?.text?.length || 0}`;
  }, [streamingMessage]);

  // Group consecutive messages by role for display
  // Consecutive assistant messages are merged into a single visual block
  const displayGroups = useMemo(() => {
    // Combine messages with streaming message, avoiding duplicates
    const allMessages = streamingMessage
      ? [...messages.filter(m => m.id !== streamingMessage.id), streamingMessage]
      : messages;

    const groups: MessageGroupType[] = [];

    for (const message of allMessages) {
      const lastGroup = groups[groups.length - 1];

      // Merge consecutive assistant messages into the same group
      if (lastGroup && lastGroup.role === 'assistant' && message.role === 'assistant') {
        lastGroup.messages.push(message);
        lastGroup.isStreaming = message.id === streamingMessage?.id;
      } else {
        // Start a new group
        groups.push({
          id: message.id,
          role: message.role,
          messages: [message],
          agent: message.agent,
          isStreaming: message.id === streamingMessage?.id,
        });
      }
    }

    return groups;
  }, [messages, streamingMessage]);

  // Content container style with bottom padding for input area
  // KeyboardAwareScrollView handles additional offset when keyboard is visible
  const messageListContentStyle = useMemo(() => ({
    flexGrow: 1,
    padding: Spacing.md,
    paddingBottom: Spacing.sm + 80, // 80px for input area height
  }), []);

  const renderGroup = useCallback(
    ({ item }: { item: MessageGroupType }) => {
      // Check if this group contains the interrupted message
      const isInterrupted = interruptedMessageId !== null &&
        item.messages.some(m => m.id === interruptedMessageId);

      return (
        <MessageGroup
          group={item}
          onRevert={handleRevert}
          onFork={handleFork}
          isInterrupted={isInterrupted}
        />
      );
    },
    [handleRevert, handleFork, interruptedMessageId]
  );

  const keyExtractor = useCallback(
    (item: MessageGroupType) => `group-${item.id}`,
    []
  );

  // Get child sessions for this session
  const currentChildSessions = sessionId ? (childSessions[sessionId] || []) : [];

  const handleChildSessionPress = useCallback(
    (childSessionId: string) => {
      if (hostId && projectId) {
        router.push(`/sessions/${hostId}/${projectId}/${childSessionId}`);
      }
    },
    [hostId, projectId]
  );

  const handleParentSessionPress = useCallback(() => {
    if (parentSessionId && hostId && projectId) {
      router.push(`/sessions/${hostId}/${projectId}/${parentSessionId}`);
    }
  }, [parentSessionId, hostId, projectId]);

  const handleAgentToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newAgent = selectedAgent === 'plan' ? 'build' : 'plan';
    setSelectedAgent(newAgent);
  }, [selectedAgent, setSelectedAgent]);

  const handleThinkingToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const modes: ThinkingModeType[] = ['normal', 'high', 'max'];
    const currentIndex = modes.indexOf(thinkingMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setThinkingMode(modes[nextIndex]);
  }, [thinkingMode, setThinkingMode]);

  const handleInterrupt = useCallback(() => {
    console.log('[ChatScreen] Interrupt requested');
    abortSession();
  }, [abortSession]);

  const handleRetryConnection = useCallback(() => {
    console.log('[ChatScreen] Manual retry requested');
    useChatStore.getState().reconnect();
  }, []);

  const handleModelSelect = useCallback(
    (providerId: string, modelId: string) => {
      // Update in-memory state
      setSelectedModel(providerId, modelId, false);  // Don't auto-persist global

      // Save as session override
      if (hostId && sessionId) {
        const numericHostId = parseInt(hostId, 10);
        modelPreferencesRepository.setSessionOverride(numericHostId, sessionId, providerId, modelId).catch((error) => {
          console.error('Failed to save session model override:', error);
        });
      }
    },
    [hostId, sessionId, setSelectedModel]
  );

  const ListHeaderComponent = useCallback(() => {
    const hasContent = todos.length > 0 || parentSessionId;
    if (!hasContent) return null;

    return (
      <View style={styles.headerContainer}>
        {parentSessionId && (
          <Pressable style={styles.parentSessionBanner} onPress={handleParentSessionPress}>
            <MaterialCommunityIcons
              name="source-fork"
              size={16}
              color={Colors.primary}
            />
            <Text style={styles.parentSessionText}>
              Forked from parent session
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={16}
              color={Colors.textMuted}
            />
          </Pressable>
        )}
        {todos.length > 0 && (
          <View style={styles.todosContainer}>
            <TodoPanelCompact
              todos={todos}
              isLoading={isTodosLoading}
              onRefresh={fetchTodos}
            />
          </View>
        )}
      </View>
    );
  }, [todos, isTodosLoading, fetchTodos, parentSessionId, handleParentSessionPress]);

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <LoadingSpinner message="Loading messages..." />
        </View>
      );
    }

    return (
      <EmptyState
        icon="chat-outline"
        title="Start a conversation"
        message="Type a message to begin working with the AI agent"
      />
    );
  }, [isLoading]);

  const ListFooterComponent = useCallback(() => {
    // No longer show typing indicator here since we have the persistent StreamingIndicatorBar
    return null;
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <SessionHeader
              projectName={project?.name || 'Chat'}
              sessionTitle={currentSession?.title}
            />
          ),
          headerBackTitle: 'Sessions',
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable onPress={handleAgentToggle} style={styles.headerButton}>
                <MaterialCommunityIcons
                  name={selectedAgent === 'plan' ? 'floor-plan' : 'hammer-wrench'}
                  size={22}
                  color={getAgentColor(selectedAgent)}
                />
              </Pressable>
              <Pressable onPress={handleThinkingToggle} style={styles.headerButton}>
                <MaterialCommunityIcons
                  name="brain"
                  size={22}
                  color={
                    thinkingMode === 'normal' ? Colors.textSecondary : 
                    thinkingMode === 'high' ? Colors.purple : 
                    Colors.gold
                  }
                />
              </Pressable>
              <Pressable onPress={() => setShowSessionMenu(true)} style={styles.headerButton}>
                <MaterialCommunityIcons
                  name="dots-vertical"
                  size={22}
                  color={Colors.text}
                />
              </Pressable>
              {(isSessionBusy || isAssistantTurnActive) ? (
                <Pressable onPress={handleInterrupt} style={styles.headerButton}>
                  <View style={styles.interruptContainer}>
                    <MaterialCommunityIcons
                      name="stop-circle"
                      size={22}
                      color={Colors.error}
                    />
                    <View style={styles.connectionDot}>
                      <ConnectionDot state={connectionState} />
                    </View>
                  </View>
                </Pressable>
              ) : (
                <ConnectionStatus state={connectionState} compact onRetry={handleRetryConnection} />
              )}
            </View>
          ),
        }}
      />

      <View style={styles.container}>
        {/* Error Banner */}
        {error && (
          <ErrorBanner
            message={error}
            onDismiss={clearError}
            onRetry={() => {
              clearError();
              if (hostId && projectId && sessionId && project) {
                loadSession(parseInt(hostId, 10), parseInt(projectId, 10), sessionId, project.port);
              }
            }}
          />
        )}

        {/* Interrupt Banner */}
        <InterruptBanner
          visible={wasInterrupted}
          onDismiss={clearInterruptedState}
        />

        {/* Connection Status Banner */}
        {connectionState.status === 'error' && (
          <ErrorBanner
            message={connectionState.message}
            type="warning"
            onRetry={() => hostId && project && connect(parseInt(hostId, 10), project.port)}
          />
        )}

        {/* Messages List */}
        <FlashList
          ref={flatListRef}
          data={displayGroups}
          extraData={streamingContentKey}
          keyExtractor={keyExtractor}
          renderItem={renderGroup}
          renderScrollComponent={RenderScrollComponent}
          contentContainerStyle={messageListContentStyle}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={ListEmptyComponent}
          ListFooterComponent={ListFooterComponent}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onContentSizeChange={handleContentSizeChange}
          scrollEventThrottle={16}
        />

        {/* Scroll to Bottom Button */}
        <ScrollToBottomButton
          visible={userHasScrolledAway}
          onPress={handleJumpToBottom}
          bottomOffset={isKeyboardVisible ? 0 : bottomInset}
        />

        {/* Streaming Indicator Bar */}
        <StreamingIndicatorBar
          visible={isAwaitingResponse || (isAssistantTurnActive && streamingMessage !== null)}
          agent={selectedAgent}
          bottomOffset={isKeyboardVisible ? 80 : bottomInset + 80}
        />

        {/* Input with Permission/Question Banner */}
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          {/* Permission Banner - Fixed above input */}
          {pendingPermission && (
            <View style={styles.permissionContainer}>
              <PermissionBanner
                permission={pendingPermission}
                onRespond={handlePermissionRespond}
              />
            </View>
          )}
          {/* Question Banner - Fixed above input (when no permission pending) */}
          {!pendingPermission && pendingQuestion && (
            <View style={styles.permissionContainer}>
              <QuestionBanner
                question={pendingQuestion}
                answers={questionAnswers}
                onAnswerChange={handleQuestionAnswerChange}
                onSubmit={handleQuestionSubmit}
                onReject={handleQuestionReject}
              />
            </View>
          )}
          <ChatInput
            value={inputText}
            onChangeText={setInputText}
            onSend={handleSend}
            onSlashCommand={executeSlashCommand}
            isLoading={isSending}
            isBusy={isSessionBusy || isAssistantTurnActive}
            disabled={!isSessionReady}
            selectedAgent={selectedAgent}
            onAgentChange={setSelectedAgent}
            thinkingMode={thinkingMode}
            onThinkingModeChange={setThinkingMode}
            bottomInset={bottomInset}
          />
        </KeyboardStickyView>

        {/* Session Menu */}
        <SessionMenu
          visible={showSessionMenu}
          onClose={() => setShowSessionMenu(false)}
          providers={providers}
          providerStatuses={providerStatuses}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          onModelSelect={handleModelSelect}
          childSessions={currentChildSessions}
          onChildSessionPress={handleChildSessionPress}
          hostId={hostId ? parseInt(hostId, 10) : null}
          sessionId={sessionId}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerContainer: {
    gap: Spacing.sm,
  },
  parentSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  parentSessionText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  todosContainer: {
    marginBottom: Spacing.md,
  },
  permissionContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  interruptContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
});
