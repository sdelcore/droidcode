/**
 * SwipeableListItem - Reusable swipeable wrapper with delete and action buttons.
 * - Swipe left to reveal delete button (right side)
 * - Swipe right to reveal action buttons (left side)
 */

import { type PropsWithChildren, useRef } from 'react'
import { StyleSheet, Text, Pressable, Animated, View } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import { Colors, Spacing, FontSize } from '@/constants/Theme'

interface SwipeableListItemProps {
  onDelete: () => void
  onView?: () => void
  onRename?: () => void
  deleteLabel?: string
  disabled?: boolean
}

/**
 * Left actions component for View and Rename.
 * Revealed when swiping RIGHT (dragging the item to the right).
 * Uses classic Animated API since Swipeable passes Animated.Value, not reanimated shared values.
 */
function LeftActions({
  dragX,
  onView,
  onRename,
}: {
  dragX: Animated.AnimatedInterpolation<number>
  onView?: () => void
  onRename?: () => void
}) {
  // Classic Animated interpolation - dragX is a regular Animated.Value from Swipeable
  // For left actions, dragX is positive when swiping right
  const translateX = dragX.interpolate({
    inputRange: [0, 160],
    outputRange: [-160, 0],
    extrapolate: 'clamp',
  })

  const opacity = dragX.interpolate({
    inputRange: [0, 80, 160],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  })

  return (
    <Animated.View style={[styles.actionsContainer, { transform: [{ translateX }], opacity }]}>
      {onView && (
        <Pressable style={styles.actionButton} onPress={onView}>
          <MaterialCommunityIcons
            name="eye-outline"
            size={20}
            color={Colors.primary}
          />
          <Text style={styles.actionText}>View</Text>
        </Pressable>
      )}
      {onRename && (
        <Pressable style={styles.actionButton} onPress={onRename}>
          <MaterialCommunityIcons
            name="pencil-outline"
            size={20}
            color={Colors.primary}
          />
          <Text style={styles.actionText}>Rename</Text>
        </Pressable>
      )}
    </Animated.View>
  )
}

/**
 * Right actions component for swipeable delete.
 * Revealed when swiping LEFT (dragging the item to the left).
 * Uses classic Animated API since Swipeable passes Animated.Value, not reanimated shared values.
 */
function RightActions({
  dragX,
  onDelete,
  deleteLabel,
}: {
  dragX: Animated.AnimatedInterpolation<number>
  onDelete: () => void
  deleteLabel: string
}) {
  // Classic Animated interpolation - dragX is a regular Animated.Value from Swipeable
  const translateX = dragX.interpolate({
    inputRange: [-100, 0],
    outputRange: [0, 100],
    extrapolate: 'clamp',
  })

  const opacity = dragX.interpolate({
    inputRange: [-100, -50, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  })

  return (
    <Animated.View style={[styles.actionsContainer, { transform: [{ translateX }], opacity }]}>
      <Pressable style={styles.deleteButton} onPress={onDelete}>
        <MaterialCommunityIcons
          name="trash-can-outline"
          size={20}
          color={Colors.error}
        />
        <Text style={styles.deleteText}>{deleteLabel}</Text>
      </Pressable>
    </Animated.View>
  )
}

export function SwipeableListItem({
  children,
  onDelete,
  onView,
  onRename,
  deleteLabel = 'Delete',
  disabled = false,
}: PropsWithChildren<SwipeableListItemProps>) {
  const swipeableRef = useRef<Swipeable>(null)

  const handleDelete = () => {
    swipeableRef.current?.close()
    // Small delay to allow swipe animation to complete
    setTimeout(onDelete, 200)
  }

  const handleView = () => {
    swipeableRef.current?.close()
    setTimeout(() => onView?.(), 200)
  }

  const handleRename = () => {
    swipeableRef.current?.close()
    setTimeout(() => onRename?.(), 200)
  }

  if (disabled) {
    return <>{children}</>
  }

  const hasLeftActions = onView || onRename

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={
        hasLeftActions
          ? (progress, dragX) => (
              <LeftActions dragX={dragX} onView={handleView} onRename={handleRename} />
            )
          : undefined
      }
      renderRightActions={(progress, dragX) => (
        <RightActions dragX={dragX} onDelete={handleDelete} deleteLabel={deleteLabel} />
      )}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
    >
      {children}
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    backgroundColor: 'rgba(183, 177, 177, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.xs,
    height: '100%',
    minWidth: 80,
  },
  actionText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: 'rgba(210, 123, 123, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.xs,
    height: '100%',
    minWidth: 100,
  },
  deleteText: {
    color: Colors.error,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
})
