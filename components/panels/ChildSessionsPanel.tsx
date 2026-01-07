/**
 * ChildSessionsPanel component for displaying child/forked sessions.
 * Shows sessions that were forked from the current session.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';
import type { SessionDto } from '@/types';

interface ChildSessionsPanelProps {
  sessions: SessionDto[];
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
  onSessionPress?: (sessionId: string) => void;
}

export function ChildSessionsPanel({
  sessions,
  isCollapsible = true,
  defaultExpanded = false,
  onSessionPress,
}: ChildSessionsPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const expandProgress = useSharedValue(defaultExpanded ? 1 : 0);

  useEffect(() => {
    expandProgress.value = withTiming(expanded ? 1 : 0, { duration: 250 });
  }, [expanded, expandProgress]);

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: expandProgress.value * 400,
    opacity: expandProgress.value,
    overflow: 'hidden' as const,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${expandProgress.value * 90}deg` }],
  }));

  if (sessions.length === 0) {
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
            name="source-branch"
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.title}>Child Sessions</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{sessions.length}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
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
          {sessions.map((session) => (
            <ChildSessionItem
              key={session.id}
              session={session}
              onPress={onSessionPress ? () => onSessionPress(session.id) : undefined}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

interface ChildSessionItemProps {
  session: SessionDto;
  onPress?: () => void;
}

function ChildSessionItem({ session, onPress }: ChildSessionItemProps) {
  const scale = useSharedValue(1);

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

  const formatTime = (timestamp: number) => {
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
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onPress}
    >
      <Animated.View style={[styles.sessionItem, containerStyle]}>
        <MaterialCommunityIcons
          name="source-fork"
          size={16}
          color={Colors.textMuted}
        />

        <View style={styles.sessionContent}>
          <Text
            style={styles.sessionTitle}
            numberOfLines={1}
          >
            {session.title || 'Forked Session'}
          </Text>
          <Text style={styles.sessionTime}>
            {formatTime(session.time.updated)}
          </Text>
          {session.summary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>
                {session.summary.files} files
              </Text>
              {session.summary.additions > 0 && (
                <Text style={[styles.summaryText, styles.additions]}>
                  +{session.summary.additions}
                </Text>
              )}
              {session.summary.deletions > 0 && (
                <Text style={[styles.summaryText, styles.deletions]}>
                  -{session.summary.deletions}
                </Text>
              )}
            </View>
          )}
        </View>

        <MaterialCommunityIcons
          name="chevron-right"
          size={18}
          color={Colors.textMuted}
        />
      </Animated.View>
    </Pressable>
  );
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
  content: {
    padding: Spacing.sm,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.backgroundTertiary,
    marginBottom: Spacing.xs,
  },
  sessionContent: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
    marginBottom: 2,
  },
  sessionTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  summaryRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  summaryText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  additions: {
    color: Colors.success,
  },
  deletions: {
    color: Colors.error,
  },
});
