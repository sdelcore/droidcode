/**
 * PressableWithFeedback - Enhanced Pressable with visual + haptic feedback.
 * Provides scale animation and haptic feedback on press.
 */

import { type PropsWithChildren } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableWithFeedbackProps extends PressableProps {
  hapticType?: 'light' | 'medium' | 'heavy';
  scaleEffect?: number;
  enableHaptic?: boolean;
}

export function PressableWithFeedback({
  children,
  hapticType = 'light',
  scaleEffect = 0.98,
  enableHaptic = true,
  onPressIn,
  onPressOut,
  ...pressableProps
}: PropsWithChildren<PressableWithFeedbackProps>) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (event: any) => {
    scale.value = withSpring(scaleEffect, {
      damping: 15,
      stiffness: 300,
    });

    if (enableHaptic) {
      const hapticStyle =
        hapticType === 'heavy'
          ? Haptics.ImpactFeedbackStyle.Heavy
          : hapticType === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;

      Haptics.impactAsync(hapticStyle);
    }

    onPressIn?.(event);
  };

  const handlePressOut = (event: any) => {
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 300,
    });

    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      {...pressableProps}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[animatedStyle, pressableProps.style]}
    >
      {children}
    </AnimatedPressable>
  );
}
