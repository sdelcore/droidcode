/**
 * SessionMenu component - Slide-in hamburger menu from right side.
 * Contains model provider selector, child sessions, and context info.
 */

import { useEffect, useState, useCallback } from 'react'
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
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme'
import type { ProviderDto, ProviderStatusDto, SessionDto } from '@/types'
import { modelPreferencesRepository } from '@/services/db/repositories/modelPreferencesRepository'
import { useConfigStore } from '@/stores/configStore'

interface SessionMenuProps {
  visible: boolean
  onClose: () => void

  // Model provider
  providers: ProviderDto[]
  providerStatuses: ProviderStatusDto[]
  selectedProvider: string | null
  selectedModel: string | null
  onModelSelect: (providerId: string, modelId: string) => void

  // Child sessions
  childSessions: SessionDto[]
  onChildSessionPress: (sessionId: string) => void

  // Context for session overrides
  hostId: number | null
  sessionId: string | null
}

export function SessionMenu({
  visible,
  onClose,
  providers,
  providerStatuses,
  selectedProvider,
  selectedModel,
  onModelSelect,
  childSessions,
  onChildSessionPress,
  hostId,
  sessionId,
}: SessionMenuProps) {
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()

  // Animation values
  const translateX = useSharedValue(screenWidth)
  const opacity = useSharedValue(0)

  // Section expansion states
  const [expandedSections, setExpandedSections] = useState({
    modelProvider: false,
    childSessions: false,
  })

  // Check if current session has an override
  const [hasSessionOverride, setHasSessionOverride] = useState(false)

  useEffect(() => {
    const checkOverride = async () => {
      if (sessionId) {
        const override = await modelPreferencesRepository.getSessionOverride(sessionId)
        setHasSessionOverride(!!override)
      } else {
        setHasSessionOverride(false)
      }
    }
    checkOverride()
  }, [sessionId, selectedProvider, selectedModel])

  useEffect(() => {
    if (visible) {
      translateX.value = withTiming(0, { duration: 200 })
      opacity.value = withTiming(0.7, { duration: 250 })
    } else {
      translateX.value = withTiming(screenWidth, { duration: 200 })
      opacity.value = withTiming(0, { duration: 200 })
      // Reset expansion states when menu closes
      setExpandedSections({
        modelProvider: false,
        childSessions: false,
      })
    }
  }, [visible, translateX, opacity, screenWidth])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  const toggleSection = useCallback((section: 'modelProvider' | 'childSessions') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }, [])

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
        onModelSelect(providerId, modelId)
      }
    },
    [getProviderStatus, onModelSelect]
  )

  const handleChildSessionPress = useCallback(
    (sessionId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      onChildSessionPress(sessionId)
    },
    [onChildSessionPress]
  )

  const handleResetToDefault = useCallback(async () => {
    if (!sessionId || !hostId) return

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    try {
      // Clear session override
      await modelPreferencesRepository.clearSessionOverride(sessionId)

      // Load global default
      const globalDefault = await modelPreferencesRepository.getGlobalDefault(hostId)
      if (globalDefault) {
        onModelSelect(globalDefault.providerId, globalDefault.modelId)
      } else {
        // Fallback to server's default from configStore
        await useConfigStore.getState().loadSavedDefault(hostId)
        const { selectedProvider: defaultProvider, selectedModel: defaultModel } = useConfigStore.getState()
        if (defaultProvider && defaultModel) {
          onModelSelect(defaultProvider, defaultModel)
        }
      }

      setHasSessionOverride(false)
    } catch (error) {
      console.error('Failed to reset to default model:', error)
    }
  }, [sessionId, hostId, onModelSelect])

  // Get current model/provider names
  const currentProvider = providers.find((p) => p.id === selectedProvider)
  const currentModel = currentProvider?.models[selectedModel || '']

  // Get last 2 child sessions for preview
  const previewSessions = childSessions
    .sort((a, b) => b.time.updated - a.time.updated)
    .slice(0, 2)

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdropContainer} onPress={onClose}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
      </Pressable>

      {/* Menu Panel */}
      <Animated.View
        style={[
          styles.panel,
          panelStyle,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Session Menu</Text>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={24} color={Colors.text} />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Model Provider Section */}
          <CollapsibleSection
            title="Model Provider"
            icon="robot"
            expanded={expandedSections.modelProvider}
            onToggle={() => toggleSection('modelProvider')}
            preview={
              currentModel && currentProvider ? (
                <View style={styles.sectionPreview}>
                  <Text style={styles.previewPrimary} numberOfLines={1}>
                    {currentModel.name || currentModel.id}
                  </Text>
                  <Text style={styles.previewSecondary} numberOfLines={1}>
                    {currentProvider.name}
                  </Text>
                </View>
              ) : (
                <View style={styles.sectionPreview}>
                  <Text style={styles.previewMuted}>No model selected</Text>
                  <Text style={styles.previewSecondary}>Tap to select</Text>
                </View>
              )
            }
          >
            {/* Expanded: Full provider list */}
            {providers.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="cloud-off-outline"
                  size={32}
                  color={Colors.textMuted}
                />
                <Text style={styles.emptyText}>No providers available</Text>
              </View>
            ) : (
              providers.map((provider) => {
                const isConnected = getProviderStatus(provider.id)

                return (
                  <View key={provider.id} style={styles.providerGroup}>
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
                            {isSelected && (
                              <View style={styles.radioButtonInner} />
                            )}
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
          </CollapsibleSection>

          {/* Reset to Default Button */}
          {hasSessionOverride && (
            <Pressable style={styles.resetButton} onPress={handleResetToDefault}>
              <MaterialCommunityIcons
                name="restore"
                size={16}
                color={Colors.primary}
              />
              <Text style={styles.resetButtonText}>Reset to Default Model</Text>
            </Pressable>
          )}

          {/* Child Sessions Section */}
          {childSessions.length > 0 && (
            <CollapsibleSection
              title="Child Sessions"
              icon="source-fork"
              count={childSessions.length}
              expanded={expandedSections.childSessions}
              onToggle={() => toggleSection('childSessions')}
              preview={
                <View style={styles.sectionPreview}>
                  {previewSessions.map((session) => (
                    <View key={session.id} style={styles.sessionPreviewItem}>
                      <MaterialCommunityIcons
                        name="source-fork"
                        size={14}
                        color={Colors.primary}
                      />
                      <View style={styles.sessionPreviewContent}>
                        <Text style={styles.sessionPreviewTitle} numberOfLines={1}>
                          {session.title || 'Forked Session'}
                        </Text>
                        <Text style={styles.sessionPreviewTime}>
                          {formatTime(session.time.updated)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              }
            >
              {/* Expanded: All child sessions */}
              {childSessions
                .sort((a, b) => b.time.updated - a.time.updated)
                .map((session) => (
                  <Pressable
                    key={session.id}
                    style={styles.sessionItem}
                    onPress={() => handleChildSessionPress(session.id)}
                  >
                    <MaterialCommunityIcons
                      name="source-fork"
                      size={20}
                      color={Colors.primary}
                    />
                    <View style={styles.sessionContent}>
                      <Text style={styles.sessionTitle} numberOfLines={1}>
                        {session.title || 'Forked Session'}
                      </Text>
                      <Text style={styles.sessionTime}>
                        {formatTime(session.time.updated)}
                      </Text>
                      {session.summary && (
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryText}>
                            {session.summary.files} files
                          </Text>
                          {session.summary.additions > 0 && (
                            <Text style={[styles.summaryText, styles.additions]}>
                              +{session.summary.additions}
                            </Text>
                          )}
                          {session.summary.deletions > 0 && (
                            <Text style={[styles.summaryText, styles.deletions]}>
                              -{session.summary.deletions}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                ))}
            </CollapsibleSection>
          )}

          {/* Todos Section (Placeholder) */}
          <PlaceholderSection
            title="Todos"
            icon="checkbox-marked-outline"
            message="Coming Soon"
          />

          {/* Context Space Section (Fixed at bottom) */}
          <View style={styles.contextSection}>
            <View style={styles.contextHeader}>
              <MaterialCommunityIcons
                name="database-outline"
                size={20}
                color={Colors.textMuted}
              />
              <Text style={styles.contextTitle}>Context Space</Text>
            </View>
            <View style={styles.contextContent}>
              <Text style={styles.contextMessage}>Coming Soon</Text>
              <Text style={styles.contextSubtext}>
                Token usage tracking will be available in a future update
              </Text>
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

// ============================================================================
// Collapsible Section Component
// ============================================================================

interface CollapsibleSectionProps {
  title: string
  icon: string
  count?: number
  expanded: boolean
  onToggle: () => void
  preview?: React.ReactNode
  children: React.ReactNode
}

function CollapsibleSection({
  title,
  icon,
  count,
  expanded,
  onToggle,
  preview,
  children,
}: CollapsibleSectionProps) {
  return (
    <View style={styles.section}>
      {/* Section Header (Pressable) */}
      <Pressable style={styles.sectionHeader} onPress={onToggle}>
        <View style={styles.sectionHeaderLeft}>
          <MaterialCommunityIcons name={icon as any} size={20} color={Colors.primary} />
          <Text style={styles.sectionTitle}>{title}</Text>
          {count !== undefined && count > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{count}</Text>
            </View>
          )}
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.textSecondary}
        />
      </Pressable>

      {/* Preview (when collapsed) */}
      {!expanded && preview && <View style={styles.previewContainer}>{preview}</View>}

      {/* Expanded Content */}
      {expanded && <View style={styles.expandedContent}>{children}</View>}
    </View>
  )
}

// ============================================================================
// Placeholder Section Component
// ============================================================================

interface PlaceholderSectionProps {
  title: string
  icon: string
  message: string
}

function PlaceholderSection({ title, icon, message }: PlaceholderSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.placeholderHeader}>
        <View style={styles.sectionHeaderLeft}>
          <MaterialCommunityIcons name={icon as any} size={20} color={Colors.textMuted} />
          <Text style={[styles.sectionTitle, styles.placeholderTitle]}>{title}</Text>
        </View>
        <Text style={styles.placeholderMessage}>{message}</Text>
      </View>
    </View>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  backdropContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '80%',
    backgroundColor: Colors.background,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.backgroundSecondary,
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
    padding: Spacing.md,
    gap: Spacing.md,
  },

  // Section styles
  section: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  countBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    minWidth: 20,
    alignItems: 'center',
  },
  countText: {
    fontSize: FontSize.xs,
    color: Colors.background,
    fontWeight: '600',
  },
  previewContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  sectionPreview: {
    gap: Spacing.xs,
  },
  previewPrimary: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '500',
  },
  previewSecondary: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  previewMuted: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  expandedContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },

  // Model provider styles
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  providerGroup: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
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
  modelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginLeft: Spacing.md,
  },
  modelOptionSelected: {
    backgroundColor: 'rgba(183, 177, 177, 0.1)',
  },
  modelOptionDisabled: {
    opacity: 0.5,
  },
  radioButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  modelName: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontFamily: FontFamily.mono,
  },
  modelNameSelected: {
    color: Colors.primary,
    fontWeight: '500',
  },
  modelNameDisabled: {
    color: Colors.textMuted,
  },

  // Reset button styles
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginTop: Spacing.sm,
  },
  resetButtonText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },

  // Child sessions styles
  sessionPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  sessionPreviewContent: {
    flex: 1,
  },
  sessionPreviewTitle: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  sessionPreviewTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.backgroundTertiary,
  },
  sessionContent: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '500',
    marginBottom: 2,
  },
  sessionTime: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  summaryRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  summaryText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  additions: {
    color: Colors.success,
  },
  deletions: {
    color: Colors.error,
  },

  // Placeholder section styles
  placeholderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  placeholderTitle: {
    color: Colors.textMuted,
  },
  placeholderMessage: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  // Context section styles
  contextSection: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  contextTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  contextContent: {
    gap: Spacing.xs,
  },
  contextMessage: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  contextSubtext: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
})
