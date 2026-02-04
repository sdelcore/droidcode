import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, FlatList, SectionList, Pressable, RefreshControl, AppState } from 'react-native';
import { router, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Text, View } from '@/components/Themed';
import { useSessionStore } from '@/stores/sessionStore';
import { useProjectStore } from '@/stores/projectStore';
import { BrailleSpinner } from '@/components/feedback/BrailleSpinner';
import { SwipeableListItem } from '@/components/shared/SwipeableListItem';
import { Checkbox } from '@/components/shared/Checkbox';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { RenameDialog } from '@/components/dialogs/RenameDialog';
import { FilterBar, SortOptionsModal, SessionGroupHeader, SessionEmptyState } from '@/components/filters';
import { Colors, Spacing, BorderRadius, FontSize, FontFamily, getAgentColor } from '@/constants/Theme';
import { getWorkflowPriority, WORKFLOW_GROUP_LABELS } from '@/types/domain';
import type { AgentFilter, StatusFilter } from '@/types/domain';

type Session = {
  id: string;
  title: string | null;
  time: { created: number; updated: number };
  summary?: { files: number; additions: number; deletions: number };
};

export default function SessionListScreen() {
  const { hostId: hostIdParam, projectId: projectIdParam } = useLocalSearchParams<{
    hostId: string;
    projectId: string;
  }>();
  const hostId = parseInt(hostIdParam, 10);
  const projectId = parseInt(projectIdParam, 10);

  // Use selective subscriptions to prevent unnecessary re-renders
  const sessions = useSessionStore((state) => state.sessions);
  const childSessions = useSessionStore((state) => state.childSessions);
  const sessionMetadata = useSessionStore((state) => state.sessionMetadata);
  const isLoading = useSessionStore((state) => state.isLoading);
  const isRefreshing = useSessionStore((state) => state.isRefreshing);
  const fetchSessions = useSessionStore((state) => state.fetchSessions);
  const createSession = useSessionStore((state) => state.createSession);
  const deleteSession = useSessionStore((state) => state.deleteSession);
  const deleteMultipleSessions = useSessionStore((state) => state.deleteMultipleSessions);
  const renameSession = useSessionStore((state) => state.renameSession);
  
  // Filter state
  const filters = useSessionStore((state) => state.filters);
  const filtersLoaded = useSessionStore((state) => state.filtersLoaded);
  const loadFilters = useSessionStore((state) => state.loadFilters);
  const toggleAgentFilter = useSessionStore((state) => state.toggleAgentFilter);
  const toggleStatusFilter = useSessionStore((state) => state.toggleStatusFilter);
  const setSortPreset = useSessionStore((state) => state.setSortPreset);
  const clearFilters = useSessionStore((state) => state.clearFilters);
  const getFilteredSessions = useSessionStore((state) => state.getFilteredSessions);
  
  const projects = useProjectStore((state) => state.projects);

  const project = projects.find((p) => p.id === projectId);

  // Dialog states
  const [deleteDialogSession, setDeleteDialogSession] = useState<Session | null>(null);
  const [renameDialogSession, setRenameDialogSession] = useState<Session | null>(null);

  // Multi-select states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [isDeletingMultiple, setIsDeletingMultiple] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 });

  // Track initialization to prevent double-fetching on mount
  const [isInitialized, setIsInitialized] = useState(false);
  const lastFetchRef = useRef<number>(0);
  const FETCH_DEBOUNCE_MS = 1000; // Prevent duplicate fetches within 1 second

  // Fire-and-forget refresh: show spinner briefly, then dismiss while fetch continues
  const [showRefreshSpinner, setShowRefreshSpinner] = useState(false);
  
  // Sort modal state
  const [showSortModal, setShowSortModal] = useState(false);
  
  // Get filtered and sorted sessions
  const filteredSessions = useMemo(() => getFilteredSessions(), [
    sessions,
    sessionMetadata,
    filters,
    getFilteredSessions,
  ]);
  
  // Group sessions for workflow sort (with section headers)
  const groupedSessions = useMemo(() => {
    if (filters.sortPreset !== 'workflow') {
      // Single section for non-workflow sorts
      return [{ title: '', data: filteredSessions, key: 'all' }];
    }
    
    // Group by workflow priority
    const groups: Record<string, Session[]> = {};
    
    for (const session of filteredSessions) {
      const agent = sessionMetadata[session.id]?.lastAgent;
      const isRunning = sessionMetadata[session.id]?.isBusy ?? false;
      const agentKey = agent === 'plan' || agent === 'build' ? agent : 'other';
      const statusKey = isRunning ? 'running' : 'completed';
      const groupKey = `${agentKey}-${statusKey}`;
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(session);
    }
    
    // Sort groups by workflow priority and filter out empty ones
    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
      const priorityA = getWorkflowPriority(a.split('-')[0], a.endsWith('running'));
      const priorityB = getWorkflowPriority(b.split('-')[0], b.endsWith('running'));
      return priorityA - priorityB;
    });
    
    return sortedGroupKeys.map((key) => ({
      title: WORKFLOW_GROUP_LABELS[key] || key,
      data: groups[key],
      key,
    }));
  }, [filteredSessions, sessionMetadata, filters.sortPreset]);

  // Debounced fetch to prevent duplicate calls
  const debouncedFetchSessions = useCallback(() => {
    if (!hostId || !project?.port) return;

    const now = Date.now();
    if (now - lastFetchRef.current < FETCH_DEBOUNCE_MS) {
      console.log('[SessionListScreen] Skipping duplicate fetch (debounced)');
      return;
    }

    lastFetchRef.current = now;
    fetchSessions(hostId, project.port);
  }, [hostId, project?.port, fetchSessions]);

  // Fire-and-forget refresh handler: show spinner briefly, dismiss while fetch continues
  const handleRefresh = useCallback(() => {
    if (!project?.port) return;

    setShowRefreshSpinner(true);
    fetchSessions(hostId, project.port);

    // Auto-hide spinner after 500ms (fetch continues in background)
    setTimeout(() => setShowRefreshSpinner(false), 500);
  }, [hostId, project?.port, fetchSessions]);

  // Load filter preferences on mount
  useEffect(() => {
    if (!filtersLoaded) {
      loadFilters();
    }
  }, [filtersLoaded, loadFilters]);
  
  // Initial load
  useEffect(() => {
    if (hostId && project) {
      debouncedFetchSessions();
      setIsInitialized(true);
    }
  }, [hostId, project?.id, project?.port, debouncedFetchSessions]);

  // Auto-refresh when navigating back to this screen
  useFocusEffect(
    useCallback(() => {
      // Skip on initial mount - useEffect handles that
      if (!isInitialized) return;

      // Silently refresh when returning to this screen
      debouncedFetchSessions();
    }, [isInitialized, debouncedFetchSessions])
  );

  // Auto-refresh when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      // Only refresh when coming to foreground and screen is initialized
      if (nextAppState === 'active' && isInitialized) {
        debouncedFetchSessions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isInitialized, debouncedFetchSessions]);

  const handleSessionPress = (sessionId: string) => {
    router.push(`/sessions/${hostId}/${projectId}/${sessionId}`);
  };

  const handleNewSession = async () => {
    if (!project?.port) {
      setDeleteDialogSession({
        id: 'error',
        title: 'Error',
        time: { created: 0, updated: 0 },
      });
      return;
    }
    const sessionId = await createSession(hostId, undefined, project.port);
    if (sessionId) {
      router.push(`/sessions/${hostId}/${projectId}/${sessionId}`);
    }
  };

  const handleSessionLongPress = (session: Session) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSelectionMode(true);
    setSelectedSessionIds(new Set([session.id]));
  };

  const toggleSessionSelection = (sessionId: string) => {
    Haptics.selectionAsync();
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      // Exit selection mode if deselecting last item
      if (next.size === 0) {
        setIsSelectionMode(false);
      }
      return next;
    });
  };

  const handleCancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedSessionIds(new Set());
  };

  const handleMultiDelete = () => {
    const count = selectedSessionIds.size;
    setDeleteDialogSession({
      id: 'multi',
      title: `Delete ${count} session${count > 1 ? 's' : ''}`,
      time: { created: 0, updated: 0 },
    });
  };

  const confirmMultiDelete = async () => {
    const idsToDelete = Array.from(selectedSessionIds);
    setIsDeletingMultiple(true);
    setDeleteProgress({ current: 0, total: idsToDelete.length });

    const result = await deleteMultipleSessions(
      idsToDelete,
      project?.port,
      (completed, total) => {
        setDeleteProgress({ current: completed, total });
      }
    );

    setIsDeletingMultiple(false);
    setDeleteDialogSession(null);

    if (result.failed.length === 0) {
      // All succeeded
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSelectionMode(false);
      setSelectedSessionIds(new Set());
    } else {
      // Some failed - keep selection mode, update selected to only failed ones
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSelectedSessionIds(new Set(result.failed));
    }
  };

  const handleViewSession = (session: Session) => {
    handleSessionPress(session.id);
  };

  const handleRenameSession = (session: Session) => {
    setRenameDialogSession(session);
  };

  const handleRename = async (newTitle: string) => {
    if (renameDialogSession && project?.port) {
      await renameSession(renameDialogSession.id, newTitle, project.port);
      setRenameDialogSession(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialogSession || !project?.port) return;

    if (deleteDialogSession.id === 'multi') {
      await confirmMultiDelete();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await deleteSession(deleteDialogSession.id, project.port);
      setDeleteDialogSession(null);
    }
  };

  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }, []);

  // Filter handlers
  const handleToggleAgent = useCallback((agent: AgentFilter) => {
    toggleAgentFilter(agent);
  }, [toggleAgentFilter]);

  const handleToggleStatus = useCallback((status: StatusFilter) => {
    toggleStatusFilter(status);
  }, [toggleStatusFilter]);

  const handleSortPress = useCallback(() => {
    setShowSortModal(true);
  }, []);

  const handleSortSelect = useCallback((preset: typeof filters.sortPreset) => {
    setSortPreset(preset);
  }, [setSortPreset]);

  const handleClearFilters = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  // Memoize renderItem to prevent recreating on every render
  const renderItem = useCallback(({ item }: { item: Session }) => {
    const childCount = childSessions[item.id]?.length || 0;
    const metadata = sessionMetadata[item.id];
    const agentColor = getAgentColor(metadata?.lastAgent);
    const isSelected = selectedSessionIds.has(item.id);
    
    return (
      <View style={styles.listItemWrapper}>
        {/* Checkbox (only visible in selection mode) */}
        {isSelectionMode && (
          <View style={styles.checkboxContainer}>
            <Checkbox
              checked={isSelected}
              onToggle={() => toggleSessionSelection(item.id)}
            />
          </View>
        )}

        {/* Swipeable wrapper (disabled in selection mode) - flex: 1 ensures it fills available width */}
        <View style={{ flex: 1 }}>
          <SwipeableListItem
            onDelete={() => setDeleteDialogSession(item)}
            onView={() => handleViewSession(item)}
            onRename={() => handleRenameSession(item)}
            disabled={isSelectionMode}
          >
          <Pressable
            style={[styles.sessionItem, isSelected && styles.sessionItemSelected]}
            onPress={() =>
              isSelectionMode
                ? toggleSessionSelection(item.id)
                : handleSessionPress(item.id)
            }
            onLongPress={() => handleSessionLongPress(item)}
            delayLongPress={500}
          >
            <View style={[styles.accentBar, { backgroundColor: agentColor }]} />
            <View style={styles.sessionInfo}>
              <View style={styles.sessionTitleRow}>
                <Text style={styles.sessionTitle} numberOfLines={1}>
                  {item.title || 'New Session'}
                </Text>
                {childCount > 0 && (
                  <View style={styles.childCountBadge}>
                    <MaterialCommunityIcons
                      name="source-branch"
                      size={12}
                      color={Colors.cyan}
                    />
                    <Text style={styles.childCountText}>{childCount}</Text>
                  </View>
                )}
              </View>
              <View style={styles.sessionTimeRow}>
                <Text style={styles.sessionTime}>
                  {formatTime(item.time.updated)}
                </Text>
                {metadata?.isBusy && (
                  <BrailleSpinner size={14} color={Colors.primary} />
                )}
              </View>
              {item.summary && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryText}>
                    {item.summary.files} files
                  </Text>
                  {item.summary.additions > 0 && (
                    <Text style={[styles.summaryText, styles.additions]}>
                      +{item.summary.additions}
                    </Text>
                  )}
                  {item.summary.deletions > 0 && (
                    <Text style={[styles.summaryText, styles.deletions]}>
                      -{item.summary.deletions}
                    </Text>
                  )}
                </View>
              )}
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={Colors.textMuted}
            />
          </Pressable>
          </SwipeableListItem>
        </View>
      </View>
    );
  }, [
    childSessions,
    sessionMetadata,
    formatTime,
    isSelectionMode,
    selectedSessionIds,
    toggleSessionSelection,
    handleSessionPress,
    handleSessionLongPress,
    setDeleteDialogSession,
    handleViewSession,
    handleRenameSession,
  ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: isSelectionMode
            ? `${selectedSessionIds.size} selected`
            : project?.name || 'Sessions',
          headerBackTitle: 'Projects',
          headerRight: () =>
            isSelectionMode ? (
              <Pressable onPress={handleCancelSelection} style={{ paddingHorizontal: Spacing.md }}>
                <Text style={styles.cancelButton}>Cancel</Text>
              </Pressable>
            ) : null,
        }}
      />

      <View style={styles.container}>
        {/* Filter Bar */}
        <FilterBar
          filters={filters}
          onToggleAgent={handleToggleAgent}
          onToggleStatus={handleToggleStatus}
          onSortPress={handleSortPress}
        />
        
        {/* Session List */}
        {filters.sortPreset === 'workflow' ? (
          <SectionList
            sections={groupedSessions}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={showRefreshSpinner}
                onRefresh={handleRefresh}
              />
            }
            renderItem={renderItem}
            renderSectionHeader={({ section }) => 
              section.title ? (
                <SessionGroupHeader label={section.title} count={section.data.length} />
              ) : null
            }
            extraData={{
              selectedSessionIds,
              isSelectionMode,
              childSessions,
              sessionMetadata
            }}
            ListEmptyComponent={
              <SessionEmptyState
                filters={filters}
                onClearFilters={handleClearFilters}
                isLoading={isLoading}
              />
            }
            contentContainerStyle={filteredSessions.length === 0 ? styles.emptyList : undefined}
            stickySectionHeadersEnabled={false}
          />
        ) : (
          <FlatList
            data={filteredSessions}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={showRefreshSpinner}
                onRefresh={handleRefresh}
              />
            }
            renderItem={renderItem}
            extraData={{
              selectedSessionIds,
              isSelectionMode,
              childSessions,
              sessionMetadata
            }}
            ListEmptyComponent={
              <SessionEmptyState
                filters={filters}
                onClearFilters={handleClearFilters}
                isLoading={isLoading}
              />
            }
            contentContainerStyle={filteredSessions.length === 0 ? styles.emptyList : undefined}
          />
        )}

        {/* Show delete FAB in selection mode, otherwise new session FAB */}
        {isSelectionMode && selectedSessionIds.size > 0 ? (
          <Pressable style={[styles.fab, styles.fabDelete]} onPress={handleMultiDelete}>
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={24}
              color={Colors.background}
            />
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{selectedSessionIds.size}</Text>
            </View>
          </Pressable>
        ) : !isSelectionMode ? (
          <Pressable style={styles.fab} onPress={handleNewSession}>
            <MaterialCommunityIcons name="plus" size={24} color={Colors.background} />
          </Pressable>
        ) : null}

        {/* Rename Dialog */}
        <RenameDialog
          visible={!!renameDialogSession}
          title="Rename Session"
          placeholder="Session name"
          initialValue={renameDialogSession?.title || ''}
          onConfirm={handleRename}
          onCancel={() => setRenameDialogSession(null)}
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          visible={!!deleteDialogSession}
          title={
            deleteDialogSession?.id === 'multi'
              ? `Delete ${selectedSessionIds.size} Sessions`
              : 'Delete Session'
          }
          message={
            deleteDialogSession?.id === 'multi'
              ? `${selectedSessionIds.size} session${
                  selectedSessionIds.size > 1 ? 's' : ''
                } will be permanently deleted. This action cannot be undone.`
              : `"${
                  deleteDialogSession?.title || 'Untitled Session'
                }" will be permanently deleted.`
          }
          icon="trash-can-outline"
          iconColor={Colors.error}
          confirmText={
            isDeletingMultiple
              ? `Deleting ${deleteProgress.current} of ${deleteProgress.total}...`
              : 'Delete'
          }
          confirmColor={Colors.error}
          isDestructive
          isLoading={isDeletingMultiple}
          onConfirm={handleDelete}
          onCancel={() => {
            if (!isDeletingMultiple) {
              setDeleteDialogSession(null);
            }
          }}
        />
        
        {/* Sort Options Modal */}
        <SortOptionsModal
          visible={showSortModal}
          currentSort={filters.sortPreset}
          onSelect={handleSortSelect}
          onClose={() => setShowSortModal(false)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listItemWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxContainer: {
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingRight: Spacing.lg,
    paddingLeft: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sessionItemSelected: {
    backgroundColor: 'rgba(183, 177, 177, 0.1)',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  sessionInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sessionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    flex: 1,
    color: Colors.text,
  },
  childCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(107, 155, 210, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.lg,
  },
  childCountText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.cyan,
  },
  sessionTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  sessionTime: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  summaryRow: {
    flexDirection: 'row',
    marginTop: Spacing.xs,
    gap: Spacing.md,
  },
  summaryText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: FontFamily.mono,
  },
  additions: {
    color: Colors.diffAdded,
    fontFamily: FontFamily.mono,
  },
  deletions: {
    color: Colors.diffRemoved,
    fontFamily: FontFamily.mono,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabDelete: {
    backgroundColor: Colors.error,
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.error,
  },
  fabBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  cancelButton: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
