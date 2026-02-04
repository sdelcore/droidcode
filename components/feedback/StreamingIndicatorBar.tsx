/**
 * Persistent streaming indicator bar that shows at the bottom of the screen
 * when the assistant is streaming a response.
 */

import React from 'react'
import { StyleSheet, View, Text } from 'react-native'
import Animated, {
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { KnightRiderLoader } from './LoadingStates'
import { Colors, Spacing, FontSize, getAgentColor } from '@/constants/Theme'

interface StreamingIndicatorBarProps {
  visible: boolean
  agent?: string
  bottomOffset?: number
}

export function StreamingIndicatorBar({
  visible,
  agent,
  bottomOffset = 0,
}: StreamingIndicatorBarProps) {
  const insets = useSafeAreaInsets()
  const agentColor = getAgentColor(agent)

  const containerStyle = useAnimatedStyle(() => ({
    bottom: bottomOffset > 0 ? bottomOffset : insets.bottom,
  }))

  if (!visible) return null

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, containerStyle]}
    >
      <View style={styles.content}>
        <View style={styles.loaderContainer}>
          <KnightRiderLoader color={agentColor} count={7} />
        </View>
        <Text style={styles.text}>Assistant is processing...</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
  },
  content: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  loaderContainer: {
    width: '100%',
    height: 3,
  },
  text: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
})