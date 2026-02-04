import { useCallback } from 'react'
import { StyleSheet, Pressable } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { View, Text } from '@/components/Themed'
import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme'
import type { SessionFilters } from '@/types/domain'

interface SessionEmptyStateProps {
  filters: SessionFilters
  onClearFilters: () => void
  isLoading?: boolean
}

/**
 * Empty state component for the session list.
 * Shows different messages based on active filters.
 */
export function SessionEmptyState({
  filters,
  onClearFilters,
  isLoading,
}: SessionEmptyStateProps) {
  const hasFilters = filters.agents.size > 0 || filters.statuses.size > 0

  const handleClearFilters = useCallback(() => {
    Haptics.selectionAsync()
    onClearFilters()
  }, [onClearFilters])

  if (isLoading) {
    return null
  }

  if (hasFilters) {
    return (
      <View style={styles.container}>
        <MaterialCommunityIcons
          name="filter-off-outline"
          size={64}
          color={Colors.textMuted}
        />
        <Text style={styles.title}>No sessions match filters</Text>
        <Text style={styles.subtitle}>
          {getFilterDescription(filters)}
        </Text>
        <Pressable style={styles.clearButton} onPress={handleClearFilters}>
          <Text style={styles.clearButtonText}>Clear Filters</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name="chat-outline"
        size={64}
        color={Colors.textMuted}
      />
      <Text style={styles.title}>No sessions yet</Text>
      <Text style={styles.subtitle}>Start a new conversation</Text>
    </View>
  )
}

/**
 * Generate a human-readable description of active filters.
 */
function getFilterDescription(filters: SessionFilters): string {
  const parts: string[] = []

  if (filters.agents.size > 0) {
    const agents = Array.from(filters.agents)
      .map((a) => a.charAt(0).toUpperCase() + a.slice(1))
      .join(' or ')
    parts.push(agents)
  }

  if (filters.statuses.size > 0) {
    const statuses = Array.from(filters.statuses)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' or ')
    parts.push(statuses)
  }

  if (parts.length === 0) {
    return 'Try adjusting your filters'
  }

  return `Looking for: ${parts.join(' • ')}`
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    marginTop: Spacing.lg,
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  clearButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundTertiary,
  },
  clearButtonText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
})
