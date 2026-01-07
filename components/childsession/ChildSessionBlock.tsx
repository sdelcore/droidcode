/**
 * ChildSessionBlock component for displaying spawned agent sessions.
 */

import { StyleSheet, View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';
import { AGENTS, AgentType } from '@/types';

interface ChildSessionBlockProps {
  sessionId: string;
  agent: AgentType;
  title?: string;
  status: 'running' | 'completed' | 'error';
  onPress?: () => void;
}

export function ChildSessionBlock({
  sessionId,
  agent,
  title,
  status,
  onPress,
}: ChildSessionBlockProps) {
  const agentInfo = AGENTS[agent] || AGENTS.build;

  const pulseStyle = useAnimatedStyle(() => {
    if (status !== 'running') return { opacity: 1 };

    return {
      opacity: withRepeat(
        withTiming(0.5, { duration: 800 }),
        -1,
        true
      ),
    };
  });

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Pressable
        style={({ pressed }) => [
          styles.container,
          pressed && styles.containerPressed,
        ]}
        onPress={onPress}
      >
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: getAgentColor(agent) }]}>
            <MaterialCommunityIcons
              name={agentInfo.icon as keyof typeof MaterialCommunityIcons.glyphMap}
              size={16}
              color={Colors.text}
            />
          </View>

          <View style={styles.info}>
            <Text style={styles.agentName}>{agentInfo.displayName}</Text>
            {title && (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            )}
          </View>

          <Animated.View style={[styles.statusBadge, pulseStyle]}>
            <StatusIcon status={status} />
            <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
              {status === 'running' ? 'Running' : status === 'completed' ? 'Done' : 'Error'}
            </Text>
          </Animated.View>
        </View>

        {status === 'running' && (
          <View style={styles.progressBar}>
            <Animated.View
              style={[
                styles.progressIndicator,
                pulseStyle,
              ]}
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function StatusIcon({ status }: { status: 'running' | 'completed' | 'error' }) {
  switch (status) {
    case 'running':
      return (
        <MaterialCommunityIcons
          name="loading"
          size={14}
          color={Colors.orange}
        />
      );
    case 'completed':
      return (
        <MaterialCommunityIcons
          name="check-circle"
          size={14}
          color={Colors.success}
        />
      );
    case 'error':
      return (
        <MaterialCommunityIcons
          name="alert-circle"
          size={14}
          color={Colors.error}
        />
      );
  }
}

function getAgentColor(agent: AgentType): string {
  const colors: Record<AgentType, string> = {
    build: 'rgba(0, 122, 255, 0.3)',
    plan: 'rgba(175, 82, 222, 0.3)',
    shell: 'rgba(255, 149, 0, 0.3)',
    explore: 'rgba(48, 209, 88, 0.3)',
    general: 'rgba(100, 100, 100, 0.3)',
  };
  return colors[agent] || colors.build;
}

function getStatusColor(status: 'running' | 'completed' | 'error'): string {
  switch (status) {
    case 'running':
      return Colors.orange;
    case 'completed':
      return Colors.success;
    case 'error':
      return Colors.error;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginVertical: Spacing.xs,
  },
  containerPressed: {
    opacity: 0.8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  agentName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  title: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundSecondary,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  progressBar: {
    height: 2,
    backgroundColor: Colors.backgroundSecondary,
  },
  progressIndicator: {
    height: '100%',
    width: '50%',
    backgroundColor: Colors.orange,
    borderRadius: 1,
  },
});
