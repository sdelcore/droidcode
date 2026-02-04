import { useCallback } from 'react'
import { StyleSheet, Pressable } from 'react-native'
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

import { Text } from '@/components/Themed'
import { Colors, Spacing, BorderRadius, FontSize, FontFamily, Duration } from '@/constants/Theme'

interface FilterPillProps {
  label: string
  active: boolean
  onPress: () => void
  icon?: React.ReactNode
  testID?: string
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Terminal-style toggle pill for session filtering.
 * Displays as a monospace button that toggles between active/inactive states.
 */
export function FilterPill({ label, active, onPress, icon, testID }: FilterPillProps) {
  const scale = useSharedValue(1)

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.95, { duration: Duration.fast })
  }, [scale])

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: Duration.fast })
  }, [scale])

  const handlePress = useCallback(() => {
    Haptics.selectionAsync()
    onPress()
  }, [onPress])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <AnimatedPressable
      style={[
        styles.pill,
        active ? styles.pillActive : styles.pillInactive,
        animatedStyle,
      ]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={testID}
    >
      {icon}
      <Text
        style={[
          styles.label,
          active ? styles.labelActive : styles.labelInactive,
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: Colors.backgroundTertiary,
    borderColor: Colors.borderLight,
  },
  pillInactive: {
    backgroundColor: 'transparent',
    borderColor: Colors.border,
  },
  label: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
  },
  labelActive: {
    color: Colors.text,
  },
  labelInactive: {
    color: Colors.textMuted,
  },
})
