/**
 * Banner that appears when a request is interrupted.
 * Uses the same animation pattern as ErrorBanner for consistency.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Spacing, FontSize } from '@/constants/Theme';

interface InterruptBannerProps {
  visible: boolean;
  onDismiss?: () => void;
  autoDismissMs?: number;  // Auto-dismiss after this many ms (default: 3000)
}

export function InterruptBanner({
  visible,
  onDismiss,
  autoDismissMs = 3000,
}: InterruptBannerProps) {
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 15, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 200 });

      // Auto-dismiss after timeout
      if (autoDismissMs > 0) {
        const timeout = setTimeout(() => {
          handleDismiss();
        }, autoDismissMs);
        return () => clearTimeout(timeout);
      }
    } else {
      translateY.value = withTiming(-100, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, autoDismissMs]);

  const handleDismiss = () => {
    translateY.value = withTiming(-100, { duration: 200 });
    opacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => onDismiss?.(), 200);
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.banner, containerStyle]}>
      <MaterialCommunityIcons
        name="stop-circle-outline"
        size={20}
        color={Colors.warning}
      />
      <Text style={styles.bannerText}>Request interrupted</Text>
      <Pressable onPress={handleDismiss} hitSlop={8}>
        <MaterialCommunityIcons
          name="close"
          size={20}
          color={Colors.warning}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: 'rgba(210, 195, 107, 0.15)',  // Warning color with alpha
  },
  bannerText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.warning,
    fontWeight: '500',
  },
});
