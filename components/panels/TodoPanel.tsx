/**
 * TodoPanel component for displaying AI task list.
 * Shows task progress with animated state transitions.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  cancelAnimation,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';
import type { TodoDto, TodoStatus } from '@/types';

interface TodoPanelProps {
  todos: TodoDto[];
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
  isLoading?: boolean;
  onTodoPress?: (todo: TodoDto) => void;
  onRefresh?: () => void;
}

export function TodoPanel({
  todos,
  isCollapsible = true,
  defaultExpanded = true,
  isLoading = false,
  onTodoPress,
  onRefresh,
}: TodoPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const expandProgress = useSharedValue(defaultExpanded ? 1 : 0);

  useEffect(() => {
    expandProgress.value = withTiming(expanded ? 1 : 0, { duration: 250 });
  }, [expanded, expandProgress]);

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: expandProgress.value * 500,
    opacity: expandProgress.value,
    overflow: 'hidden' as const,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${expandProgress.value * 90}deg` }],
  }));

  const stats = useMemo(() => {
    const completed = todos.filter((t) => t.status === 'completed').length;
    const inProgress = todos.filter((t) => t.status === 'in_progress').length;
    const pending = todos.filter((t) => t.status === 'pending').length;
    const total = todos.length;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    return { completed, inProgress, pending, total, progress };
  }, [todos]);

  if (todos.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.header}
        onPress={() => isCollapsible && setExpanded(!expanded)}
        disabled={!isCollapsible}
      >
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="checkbox-marked-outline"
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.title}>Tasks</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {stats.completed}/{stats.total}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <ProgressIndicator
            completed={stats.completed}
            total={stats.total}
          />
          {onRefresh && (
            <Pressable
              onPress={onRefresh}
              disabled={isLoading}
              style={styles.refreshButton}
            >
              <MaterialCommunityIcons
                name="refresh"
                size={18}
                color={isLoading ? Colors.textMuted : Colors.primary}
              />
            </Pressable>
          )}
          {isCollapsible && (
            <Animated.View style={chevronStyle}>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={Colors.textMuted}
              />
            </Animated.View>
          )}
        </View>
      </Pressable>

      <Animated.View style={contentStyle}>
        <View style={styles.content}>
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onPress={onTodoPress ? () => onTodoPress(todo) : undefined}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * Compact todo panel for inline display.
 */
export function TodoPanelCompact({
  todos,
  isLoading,
  onRefresh,
}: {
  todos: TodoDto[];
  isLoading?: boolean;
  onRefresh?: () => void;
}) {
  const stats = useMemo(() => {
    const completed = todos.filter((t) => t.status === 'completed').length;
    const inProgress = todos.filter((t) => t.status === 'in_progress').length;
    const total = todos.length;
    return { completed, inProgress, total };
  }, [todos]);

  const currentTask = todos.find((t) => t.status === 'in_progress');

  if (todos.length === 0) {
    return null;
  }

  return (
    <View style={styles.compactContainer}>
      <View style={styles.compactHeader}>
        <MaterialCommunityIcons
          name="checkbox-marked-outline"
          size={14}
          color={Colors.textMuted}
        />
        <Text style={styles.compactStats}>
          {stats.completed}/{stats.total} tasks
        </Text>
        {onRefresh && (
          <Pressable
            onPress={onRefresh}
            disabled={isLoading}
            style={styles.compactRefreshButton}
          >
            <MaterialCommunityIcons
              name="refresh"
              size={14}
              color={isLoading ? Colors.textMuted : Colors.primary}
            />
          </Pressable>
        )}
      </View>
      {currentTask && (
        <View style={styles.compactCurrent}>
          <MaterialCommunityIcons
            name="progress-clock"
            size={12}
            color={Colors.primary}
          />
          <Text style={styles.compactCurrentText} numberOfLines={1}>
            {currentTask.activeForm || currentTask.content}
          </Text>
        </View>
      )}
    </View>
  );
}

interface TodoItemProps {
  todo: TodoDto;
  onPress?: () => void;
}

function TodoItem({ todo, onPress }: TodoItemProps) {
  const statusInfo = getStatusInfo(todo.status);
  const scale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (todo.status === 'in_progress') {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = 1;
    }

    return () => {
      cancelAnimation(pulseOpacity);
    };
  }, [todo.status, pulseOpacity]);

  const handlePressIn = () => {
    if (onPress) {
      scale.value = withSpring(0.98);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const displayText =
    todo.status === 'in_progress' && todo.activeForm
      ? todo.activeForm
      : todo.content;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onPress}
    >
      <Animated.View style={[styles.todoItem, containerStyle]}>
        <Animated.View style={indicatorStyle}>
          <MaterialCommunityIcons
            name={statusInfo.icon}
            size={18}
            color={statusInfo.color}
          />
        </Animated.View>

        <View style={styles.todoContent}>
          <Text
            style={[
              styles.todoText,
              todo.status === 'completed' && styles.todoTextCompleted,
            ]}
            numberOfLines={2}
          >
            {displayText}
          </Text>
        </View>

        {todo.status === 'in_progress' && (
          <View style={styles.inProgressBadge}>
            <Text style={styles.inProgressText}>Active</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

interface ProgressIndicatorProps {
  completed: number;
  total: number;
}

function ProgressIndicator({ completed, total }: ProgressIndicatorProps) {
  const progress = total > 0 ? completed / total : 0;

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

function getStatusInfo(status: TodoStatus): {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
} {
  switch (status) {
    case 'pending':
      return { icon: 'checkbox-blank-circle-outline', color: Colors.textMuted };
    case 'in_progress':
      return { icon: 'progress-clock', color: Colors.primary };
    case 'completed':
      return { icon: 'check-circle', color: Colors.success };
    default:
      return { icon: 'checkbox-blank-circle-outline', color: Colors.textMuted };
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  countBadge: {
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  countText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  refreshButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  content: {
    padding: Spacing.sm,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  todoContent: {
    flex: 1,
  },
  todoText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  todoTextCompleted: {
    color: Colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  inProgressBadge: {
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  inProgressText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '500',
  },
  progressContainer: {
    width: 40,
    height: 4,
    justifyContent: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.success,
    borderRadius: 2,
  },
  // Compact styles
  compactContainer: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  compactRefreshButton: {
    marginLeft: 'auto',
    padding: Spacing.xs,
  },
  compactStats: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  compactCurrent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginLeft: 18,
  },
  compactCurrentText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    flex: 1,
  },
});
