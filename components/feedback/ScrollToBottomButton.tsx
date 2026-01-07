/**
 * ScrollToBottomButton component
 * Floating action button that appears when user scrolls away from bottom.
 * Provides quick way to jump back to latest messages.
 */

import { useEffect } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Spacing } from '@/constants/Theme';

interface ScrollToBottomButtonProps {
  visible: boolean;
  onPress: () => void;
  bottomOffset?: number;
}

export function ScrollToBottomButton({
  visible,
  onPress,
  bottomOffset = 0,
}: ScrollToBottomButtonProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.ease),
      });
      scale.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.back(1.2)),
      });
    } else {
      opacity.value = withTiming(0, {
        duration: 150,
        easing: Easing.in(Easing.ease),
      });
      scale.value = withTiming(0.8, {
        duration: 150,
        easing: Easing.in(Easing.ease),
      });
    }
  }, [visible, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) {
    // Return invisible placeholder to avoid layout shifts
    return <Animated.View style={[styles.container, { opacity: 0 }, { bottom: 80 + bottomOffset }]} pointerEvents="none" />;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        animatedStyle,
        { bottom: 80 + bottomOffset },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <MaterialCommunityIcons
          name="chevron-down"
          size={24}
          color={Colors.background}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: Spacing.md,
    zIndex: 100,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
