/**
 * Banner that appears when streaming appears to have stalled.
 * Shows a warning and offers a refresh action to recover.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, Pressable, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';

interface StaleStreamBannerProps {
  visible: boolean;
  onRefresh: () => void;
  isRecovering?: boolean;
}

export function StaleStreamBanner({
  visible,
  onRefresh,
  isRecovering = false,
}: StaleStreamBannerProps) {
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 15, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(-100, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, translateY, opacity]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.banner, containerStyle]}>
      <MaterialCommunityIcons
        name="wifi-strength-1-alert"
        size={20}
        color={Colors.warning}
      />
      <Text style={styles.bannerText}>
        Response may have stalled
      </Text>
      <Pressable
        style={[styles.refreshButton, isRecovering && styles.refreshButtonDisabled]}
        onPress={onRefresh}
        disabled={isRecovering}
      >
        {isRecovering ? (
          <ActivityIndicator size="small" color={Colors.warning} />
        ) : (
          <Text style={styles.refreshButtonText}>Refresh</Text>
        )}
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
  refreshButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(210, 195, 107, 0.2)',
    minWidth: 70,
    alignItems: 'center',
  },
  refreshButtonDisabled: {
    opacity: 0.7,
  },
  refreshButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.warning,
  },
});
