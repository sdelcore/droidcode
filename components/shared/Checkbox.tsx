/**
 * Checkbox - Animated checkbox component for multi-select UI.
 * Uses spring animations for smooth check/uncheck transitions.
 */

import { useEffect } from 'react'
import { StyleSheet, Pressable } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

import { Colors, BorderRadius, Spacing } from '@/constants/Theme'

interface CheckboxProps {
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}

/**
 * Animated checkbox component.
 * - Unchecked: Border with transparent fill
 * - Checked: Primary color fill with white checkmark
 * - Spring animation on state change
 * - Haptic feedback on toggle
 */
export function Checkbox({ checked, onToggle, disabled = false }: CheckboxProps) {
  const progress = useSharedValue(checked ? 1 : 0)

  useEffect(() => {
    progress.value = withSpring(checked ? 1 : 0, {
      damping: 15,
      stiffness: 200,
    })
  }, [checked, progress])

  const containerStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolate(
      progress.value,
      [0, 1],
      [0, 1]
    )
    
    return {
      backgroundColor: backgroundColor === 1 ? Colors.primary : 'transparent',
      borderColor: backgroundColor === 1 ? Colors.primary : Colors.border,
    }
  })

  const checkmarkStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      progress.value,
      [0, 0.5, 1],
      [0, 1.2, 1]
    )
    
    return {
      opacity: progress.value,
      transform: [{ scale }],
    }
  })

  const handlePress = () => {
    if (!disabled) {
      Haptics.selectionAsync()
      onToggle()
    }
  }

  return (
    <Pressable onPress={handlePress} disabled={disabled} style={styles.pressable}>
      <Animated.View style={[styles.container, containerStyle]}>
        <Animated.View style={checkmarkStyle}>
          <MaterialCommunityIcons
            name="check"
            size={18}
            color={Colors.background}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressable: {
    padding: Spacing.xs,
  },
  container: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
