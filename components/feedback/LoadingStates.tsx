/**
 * Loading state components for various UI contexts.
 * Provides consistent loading indicators throughout the app.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  cancelAnimation,
  Easing,
  SharedValue,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize, getAgentColor } from '@/constants/Theme';

/**
 * Full screen loading overlay.
 */
export function LoadingOverlay({
  message = 'Loading...',
  visible = true,
}: {
  message?: string;
  visible?: boolean;
}) {
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      rotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      cancelAnimation(rotation);
    }

    return () => {
      cancelAnimation(rotation);
    };
  }, [visible, opacity, rotation]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, containerStyle]}>
      <View style={styles.overlayContent}>
        <Animated.View style={spinnerStyle}>
          <MaterialCommunityIcons
            name="loading"
            size={48}
            color={Colors.primary}
          />
        </Animated.View>
        <Text style={styles.overlayMessage}>{message}</Text>
      </View>
    </Animated.View>
  );
}

/**
 * Inline loading spinner with optional text.
 */
export function LoadingSpinner({
  size = 24,
  color = Colors.primary,
  message,
}: {
  size?: number;
  color?: string;
  message?: string;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1000, easing: Easing.linear }),
      -1,
      false
    );

    return () => {
      cancelAnimation(rotation);
    };
  }, [rotation]);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.spinnerContainer}>
      <Animated.View style={spinnerStyle}>
        <MaterialCommunityIcons name="loading" size={size} color={color} />
      </Animated.View>
      {message && <Text style={styles.spinnerMessage}>{message}</Text>}
    </View>
  );
}

/**
 * Skeleton loading placeholder for content.
 */
export function SkeletonLoader({
  width = '100%',
  height = 16,
  borderRadius = BorderRadius.sm,
}: {
  width?: number | string;
  height?: number;
  borderRadius?: number;
}) {
  const shimmerPosition = useSharedValue(0);

  useEffect(() => {
    shimmerPosition.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.ease }),
      -1,
      false
    );

    return () => {
      cancelAnimation(shimmerPosition);
    };
  }, [shimmerPosition]);

  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = shimmerPosition.value * 300 - 100;
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View
      style={[
        styles.skeleton,
        {
          width: typeof width === 'number' ? width : undefined,
          height,
          borderRadius,
        },
        typeof width === 'string' && { flex: 1 },
      ]}
    >
      <Animated.View style={[styles.shimmer, shimmerStyle]} />
    </View>
  );
}

/**
 * Message skeleton for chat loading states.
 */
export function MessageSkeleton({ isUser = false }: { isUser?: boolean }) {
  return (
    <View
      style={[
        styles.messageSkeleton,
        isUser && styles.messageSkeletonUser,
      ]}
    >
      <View style={styles.messageSkeletonContent}>
        <SkeletonLoader width="80%" height={14} />
        <SkeletonLoader width="60%" height={14} />
        <SkeletonLoader width="40%" height={14} />
      </View>
    </View>
  );
}

/**
 * Session list skeleton.
 */
export function SessionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.listSkeleton}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.sessionSkeleton}>
          <View style={styles.sessionSkeletonIcon}>
            <SkeletonLoader width={40} height={40} borderRadius={20} />
          </View>
          <View style={styles.sessionSkeletonContent}>
            <SkeletonLoader width="70%" height={16} />
            <SkeletonLoader width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Knight Rider style scanner loader.
 * Displays a full-width horizontal bar with a scanning highlight effect.
 */
export function KnightRiderLoader({ 
  count = 5, 
  color = Colors.primary,
}: { 
  count?: number;
  color?: string;
}) {
  const position = useSharedValue(0);

  useEffect(() => {
    position.value = withRepeat(
      withSequence(
        withTiming(count - 1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(position);
    };
  }, [count, position]);

  return (
    <View style={styles.knightRiderContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <KnightRiderSegment key={i} position={position} index={i} color={color} />
      ))}
    </View>
  );
}

function KnightRiderSegment({ 
  position, 
  index,
  color,
}: { 
  position: SharedValue<number>;
  index: number;
  color: string;
}) {
  const segmentStyle = useAnimatedStyle(() => {
    const distance = Math.abs(position.value - index);
    
    // Main segment is fully lit, adjacent segments have glow
    const opacity = distance < 0.5 ? 1 : distance < 1.5 ? 0.5 : 0.2;
    
    return {
      opacity,
      backgroundColor: distance < 0.5 ? color : Colors.textSecondary,
    };
  });

  return <Animated.View style={[styles.knightRiderSegment, segmentStyle]} />;
}

/**
 * Pulsing dot indicator (legacy - kept for compatibility).
 * @deprecated Use KnightRiderLoader instead
 */
export function PulsingDots({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.dotsContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <PulsingDot key={i} delay={i * 150} />
      ))}
    </View>
  );
}

function PulsingDot({ delay = 0 }: { delay?: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    const startAnimation = () => {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 400 }),
          withTiming(1, { duration: 400 })
        ),
        -1,
        false
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.5, { duration: 400 })
        ),
        -1,
        false
      );
    };

    const timeout = setTimeout(startAnimation, delay);

    return () => {
      clearTimeout(timeout);
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [delay, scale, opacity]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, dotStyle]} />;
}

/**
 * Connection loading indicator.
 */
export function ConnectingIndicator() {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withSpring(1.1, { damping: 10 }),
        withSpring(1, { damping: 10 })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(pulseScale);
    };
  }, [pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <View style={styles.connectingContainer}>
      <Animated.View style={[styles.connectingPulse, pulseStyle]}>
        <MaterialCommunityIcons
          name="wifi"
          size={24}
          color={Colors.primary}
        />
      </Animated.View>
      <Text style={styles.connectingText}>Connecting...</Text>
    </View>
  );
}

/**
 * Typing indicator for assistant responses.
 */
export function TypingIndicator({ agent }: { agent?: string }) {
  const agentColor = getAgentColor(agent);
  
  return (
    <View style={styles.typingContainer}>
      <View style={styles.typingBubble}>
        <KnightRiderLoader color={agentColor} />
      </View>
    </View>
  );
}

/**
 * Progress bar with animation.
 */
export function ProgressBar({
  progress,
  height = 4,
  color = Colors.primary,
  backgroundColor = Colors.backgroundTertiary,
}: {
  progress: number;
  height?: number;
  color?: string;
  backgroundColor?: string;
}) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withSpring(Math.min(Math.max(progress, 0), 100), {
      damping: 15,
      stiffness: 100,
    });
  }, [progress, width]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={[styles.progressBar, { height, backgroundColor }]}>
      <Animated.View
        style={[styles.progressFill, { backgroundColor: color }, barStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Overlay styles
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  overlayContent: {
    alignItems: 'center',
    gap: Spacing.lg,
  },
  overlayMessage: {
    fontSize: FontSize.md,
    color: Colors.text,
  },
  // Spinner styles
  spinnerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  spinnerMessage: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  // Skeleton styles
  skeleton: {
    backgroundColor: Colors.backgroundTertiary,
    overflow: 'hidden',
    marginVertical: 4,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: Colors.backgroundSecondary,
    opacity: 0.5,
  },
  // Message skeleton
  messageSkeleton: {
    marginVertical: Spacing.sm,
    alignItems: 'flex-start',
  },
  messageSkeletonUser: {
    alignItems: 'flex-end',
  },
  messageSkeletonContent: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    width: '70%',
    gap: Spacing.sm,
  },
  // Session skeleton
  listSkeleton: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sessionSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sessionSkeletonIcon: {},
  sessionSkeletonContent: {
    flex: 1,
    gap: Spacing.sm,
  },
  // Knight Rider loader
  knightRiderContainer: {
    flexDirection: 'row',
    width: '100%',
    height: 3,
    borderRadius: 1,
    overflow: 'hidden',
  },
  knightRiderSegment: {
    flex: 1,
    height: '100%',
    backgroundColor: Colors.textSecondary,
  },
  // Pulsing dots (legacy)
  dotsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textSecondary,
  },
  // Connecting indicator
  connectingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  connectingPulse: {},
  connectingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  // Typing indicator
  typingContainer: {
    marginVertical: Spacing.sm,
    alignItems: 'flex-start',
  },
  typingBubble: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  // Progress bar
  progressBar: {
    width: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
