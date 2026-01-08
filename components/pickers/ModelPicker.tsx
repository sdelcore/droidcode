/**
 * ModelPicker - Bottom sheet modal for selecting model provider and model.
 * Used in Settings screen for setting global default.
 */

import { useCallback } from 'react'
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme'
import type { ProviderDto, ProviderStatusDto } from '@/types'

interface ModelPickerProps {
  visible: boolean
  onClose: () => void
  providers: ProviderDto[]
  providerStatuses: ProviderStatusDto[]
  selectedProvider: string | null
  selectedModel: string | null
  onSelect: (providerId: string, modelId: string) => void
}

export function ModelPicker({
  visible,
  onClose,
  providers,
  providerStatuses,
  selectedProvider,
  selectedModel,
  onSelect,
}: ModelPickerProps) {
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()

  // Animation values
  const translateY = useSharedValue(screenHeight)
  const opacity = useSharedValue(0)

  const animateIn = useCallback(() => {
    translateY.value = withSpring(0, {
      damping: 20,
      stiffness: 250,
    })
    opacity.value = withTiming(0.7, { duration: 250 })
  }, [translateY, opacity])

  const animateOut = useCallback(() => {
    translateY.value = withTiming(screenHeight, { duration: 200 })
    opacity.value = withTiming(0, { duration: 200 })
  }, [translateY, opacity, screenHeight])

  const handleClose = useCallback(() => {
    animateOut()
    setTimeout(onClose, 200)
  }, [animateOut, onClose])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const getProviderStatus = useCallback(
    (providerId: string): boolean => {
      const status = providerStatuses.find((s) => s.id === providerId)
      return status?.connected ?? false
    },
    [providerStatuses]
  )

  const handleModelSelect = useCallback(
    (providerId: string, modelId: string) => {
      const isConnected = getProviderStatus(providerId)
      if (isConnected) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        onSelect(providerId, modelId)
        handleClose()
      }
    },
    [getProviderStatus, onSelect, handleClose]
  )

  // Trigger animation when visible changes
  if (visible) {
    setTimeout(animateIn, 0)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdropContainer} onPress={handleClose}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          sheetStyle,
          {
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Handle Bar */}
        <View style={styles.handleBar} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Select Model</Text>
          <Pressable onPress={handleClose} style={styles.closeButton} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={24} color={Colors.text} />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {providers.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="cloud-off-outline"
                size={48}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyText}>No providers available</Text>
            </View>
          ) : (
            providers.map((provider) => {
              const isConnected = getProviderStatus(provider.id)

              return (
                <View key={provider.id} style={styles.providerSection}>
                  {/* Provider Header */}
                  <View style={styles.providerHeader}>
                    <View
                      style={[
                        styles.statusDot,
                        isConnected ? styles.statusConnected : styles.statusDisconnected,
                      ]}
                    />
                    <Text
                      style={[
                        styles.providerName,
                        !isConnected && styles.providerNameDisabled,
                      ]}
                    >
                      {provider.name}
                    </Text>
                    {!isConnected && (
                      <Text style={styles.disconnectedLabel}>(not connected)</Text>
                    )}
                  </View>

                  {/* Models */}
                  {Object.values(provider.models || {}).map((model) => {
                    const isSelected =
                      selectedProvider === provider.id && selectedModel === model.id

                    return (
                      <Pressable
                        key={model.id}
                        style={[
                          styles.modelOption,
                          isSelected && styles.modelOptionSelected,
                          !isConnected && styles.modelOptionDisabled,
                        ]}
                        onPress={() => handleModelSelect(provider.id, model.id)}
                        disabled={!isConnected}
                      >
                        <View style={styles.radioButton}>
                          {isSelected && <View style={styles.radioButtonInner} />}
                        </View>
                        <Text
                          style={[
                            styles.modelName,
                            isSelected && styles.modelNameSelected,
                            !isConnected && styles.modelNameDisabled,
                          ]}
                          numberOfLines={1}
                        >
                          {model.name || model.id}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              )
            })
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdropContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },

  // Provider section
  providerSection: {
    gap: Spacing.xs,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  statusConnected: {
    backgroundColor: Colors.success,
  },
  statusDisconnected: {
    backgroundColor: Colors.error,
  },
  providerName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  providerNameDisabled: {
    color: Colors.textMuted,
  },
  disconnectedLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginLeft: Spacing.xs,
  },

  // Model option
  modelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.backgroundSecondary,
  },
  modelOptionSelected: {
    backgroundColor: 'rgba(183, 177, 177, 0.15)',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  modelOptionDisabled: {
    opacity: 0.5,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginRight: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  modelName: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    fontFamily: FontFamily.mono,
  },
  modelNameSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  modelNameDisabled: {
    color: Colors.textMuted,
  },
})
