/**
 * ThinkingBlock component for displaying AI thinking/reasoning content.
 * Shows collapsible thinking content with animated expansion.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
  cancelAnimation,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';

interface ThinkingBlockProps {
  text: string;
  isThinking?: boolean; // true = extended thinking, false = reasoning
  isStreaming?: boolean;
  defaultExpanded?: boolean;
}

export const ThinkingBlock = React.memo(function ThinkingBlock({
  text,
  isThinking = true,
  isStreaming = false,
  defaultExpanded = false,
}: ThinkingBlockProps) {
  // Always start collapsed, even during streaming
  const [expanded, setExpanded] = useState(false);
  const rotation = useSharedValue(expanded ? 1 : 0);
  const contentHeight = useSharedValue(expanded ? 1 : 0);
  const shimmerPosition = useSharedValue(0);

  useEffect(() => {
    if (isStreaming) {
      // Animate shimmer but don't auto-expand
      shimmerPosition.value = withRepeat(
        withTiming(1, { duration: 1500 }),
        -1,
        false
      );
    } else {
      cancelAnimation(shimmerPosition);
    }

    return () => {
      cancelAnimation(shimmerPosition);
    };
  }, [isStreaming, shimmerPosition]);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 1 : 0, { duration: 200 });
    contentHeight.value = withTiming(expanded ? 1 : 0, { duration: 200 });
  }, [expanded, rotation, contentHeight]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(rotation.value, [0, 1], [0, 90])}deg` },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(
      contentHeight.value,
      [0, 1],
      [0, 1000],
      Extrapolation.CLAMP
    ),
    opacity: contentHeight.value,
    marginTop: interpolate(contentHeight.value, [0, 1], [0, Spacing.sm]),
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          shimmerPosition.value,
          [0, 1],
          [-100, 300]
        ),
      },
    ],
  }));

  const toggleExpanded = () => {
    // Allow toggling even during streaming
    setExpanded(!expanded);
  };

  const accentColor = isThinking ? Colors.purple : Colors.cyan;
  const label = isThinking ? 'Thinking' : 'Reasoning';
  const icon = isThinking ? 'brain' : 'lightning-bolt';

  // Calculate preview text
  const lines = text.split('\n');
  const previewText = lines.length > 2
    ? lines.slice(0, 2).join('\n') + '...'
    : text;

  return (
    <Pressable onPress={toggleExpanded} style={styles.container}>
      <View style={[styles.block, { borderLeftColor: accentColor }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons
              name={icon}
              size={16}
              color={accentColor}
            />
            <Text style={[styles.label, { color: accentColor }]}>
              {label}
            </Text>
            {isStreaming && (
              <View style={styles.streamingBadge}>
                <View style={styles.streamingDot} />
                <Text style={styles.streamingText}>Streaming</Text>
              </View>
            )}
          </View>
          <Animated.View style={iconStyle}>
            <MaterialCommunityIcons
              name="chevron-right"
              size={18}
              color={Colors.textMuted}
            />
          </Animated.View>
        </View>

        <Animated.View style={[styles.content, contentStyle]}>
          {isStreaming && text.length === 0 ? (
            <View style={styles.shimmerContainer}>
              <View style={styles.shimmerLine}>
                <Animated.View style={[styles.shimmer, shimmerStyle]} />
              </View>
              <View style={[styles.shimmerLine, { width: '70%' }]}>
                <Animated.View style={[styles.shimmer, shimmerStyle]} />
              </View>
              <View style={[styles.shimmerLine, { width: '85%' }]}>
                <Animated.View style={[styles.shimmer, shimmerStyle]} />
              </View>
            </View>
          ) : (
            <Text style={styles.text}>
              {expanded ? text : previewText}
            </Text>
          )}
          {isStreaming && text.length > 0 && (
            <View style={styles.streamingCursor} />
          )}
        </Animated.View>

        {!expanded && text.length > 100 && (
          <Text style={styles.previewHint}>
            Tap to expand ({text.length} chars)
          </Text>
        )}
      </View>
    </Pressable>
  );
});

/**
 * Minimal thinking indicator for when content is loading.
 */
export function ThinkingIndicator({ label = 'Thinking' }: { label?: string }) {
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 400 }),
        withTiming(1, { duration: 400 })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(dotOpacity);
    };
  }, [dotOpacity]);

  const animatedDotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  return (
    <View style={styles.indicatorContainer}>
      <MaterialCommunityIcons
        name="brain"
        size={16}
        color={Colors.purple}
      />
      <Text style={styles.indicatorLabel}>{label}</Text>
      <Animated.View style={[styles.indicatorDots, animatedDotStyle]}>
        <Text style={styles.indicatorDotsText}>...</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.xs,
  },
  block: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  streamingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  streamingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  streamingText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  content: {
    overflow: 'hidden',
  },
  text: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  previewHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  shimmerContainer: {
    gap: Spacing.sm,
  },
  shimmerLine: {
    height: 14,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: Colors.backgroundTertiary,
    opacity: 0.5,
  },
  streamingCursor: {
    width: 2,
    height: 16,
    backgroundColor: Colors.purple,
    marginTop: Spacing.xs,
    borderRadius: 1,
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.purple,
  },
  indicatorLabel: {
    fontSize: FontSize.sm,
    color: Colors.purple,
    fontWeight: '600',
  },
  indicatorDots: {
    marginLeft: -4,
  },
  indicatorDotsText: {
    fontSize: FontSize.sm,
    color: Colors.purple,
    fontWeight: '600',
  },
});
