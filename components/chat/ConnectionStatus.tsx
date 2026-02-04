/**
 * ConnectionStatus component for displaying SSE connection state.
 * Supports both full and compact modes for different UI contexts.
 */

import { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';
import { ConnectionState } from '@/types';

interface ConnectionStatusProps {
  state: ConnectionState;
  compact?: boolean;
  onRetry?: () => void;
}

export function ConnectionStatus({ state, compact = false, onRetry }: ConnectionStatusProps) {
  const opacity = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (state.status !== 'connected') {
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [state.status, opacity]);

  useEffect(() => {
    if (state.status === 'connecting' || state.status === 'reconnecting') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = 1;
    }

    return () => {
      cancelAnimation(pulseScale);
    };
  }, [state.status, pulseScale]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const config = getStatusConfig(state);
  const isRetryable = (state.status === 'error' || state.status === 'disconnected') && onRetry;

  // For connected state, show nothing or just a green dot in compact mode
  if (state.status === 'connected') {
    if (compact) {
      return (
        <View style={styles.compactConnected}>
          <View style={styles.connectedDot} />
        </View>
      );
    }
    return null;
  }

  if (compact) {
    const content = (
      <Animated.View style={[styles.compactContainer, containerStyle]}>
        <Animated.View style={iconStyle}>
          <MaterialCommunityIcons
            name={config.icon}
            size={18}
            color={config.color}
          />
        </Animated.View>
      </Animated.View>
    );

    if (isRetryable) {
      return (
        <Pressable onPress={onRetry} hitSlop={8}>
          {content}
        </Pressable>
      );
    }
    return content;
  }

  const content = (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: config.bg },
        containerStyle,
      ]}
    >
      <Animated.View style={iconStyle}>
        <MaterialCommunityIcons
          name={config.icon}
          size={16}
          color={config.color}
        />
      </Animated.View>
      <Text style={[styles.text, { color: config.color }]}>
        {config.text}
        {isRetryable && state.status === 'error' ? ' (tap to retry)' : ''}
      </Text>
    </Animated.View>
  );

  if (isRetryable) {
    return (
      <Pressable onPress={onRetry}>
        {content}
      </Pressable>
    );
  }
  return content;
}

/**
 * Connection indicator dot for header/minimal display.
 */
export function ConnectionDot({ state }: { state: ConnectionState }) {
  const config = getStatusConfig(state);

  return (
    <View style={[styles.dot, { backgroundColor: config.color }]} />
  );
}

function getStatusConfig(state: ConnectionState): {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
  color: string;
  bg: string;
} {
  switch (state.status) {
    case 'connected':
      return {
        icon: 'wifi',
        text: 'Connected',
        color: Colors.success,
        bg: Colors.diffAddedBackground,
      };
    case 'disconnected':
      return {
        icon: 'wifi-off',
        text: 'Disconnected',
        color: Colors.textMuted,
        bg: Colors.backgroundTertiary,
      };
    case 'connecting':
      return {
        icon: 'wifi-sync',
        text: 'Connecting...',
        color: Colors.orange,
        bg: 'rgba(255, 149, 0, 0.1)',
      };
    case 'reconnecting':
      return {
        icon: 'wifi-sync',
        text: 'Reconnecting...',
        color: Colors.orange,
        bg: 'rgba(255, 149, 0, 0.1)',
      };
    case 'error':
      return {
        icon: 'wifi-alert',
        text: state.message || 'Connection error',
        color: Colors.error,
        bg: Colors.diffRemovedBackground,
      };
    default:
      return {
        icon: 'wifi-off',
        text: 'Unknown',
        color: Colors.textMuted,
        bg: Colors.backgroundTertiary,
      };
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  text: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  compactContainer: {
    padding: Spacing.xs,
  },
  compactConnected: {
    padding: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
