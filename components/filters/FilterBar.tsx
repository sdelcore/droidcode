import { useCallback } from 'react'
import { StyleSheet, Pressable, ScrollView } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { View, Text } from '@/components/Themed'
import { FilterPill } from './FilterPill'
import { AgentModeBadge } from '@/components/sessions/AgentModeBadge'
import { BrailleSpinner } from '@/components/feedback/BrailleSpinner'
import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme'
import type { SessionFilters, SortPreset } from '@/types/domain'

interface FilterBarProps {
  filters: SessionFilters
  onToggleAgent: (agent: 'plan' | 'build') => void
  onToggleStatus: (status: 'running' | 'completed') => void
  onSortPress: () => void
}

const SORT_LABELS: Record<SortPreset, string> = {
  recent: 'Recent',
  workflow: 'Workflow',
  created: 'Created',
  duration: 'Duration',
  files: 'Files',
  alpha: 'A-Z',
}

/**
 * Terminal-style filter bar for session list.
 * Contains filter pills for agent type and status, plus a sort button.
 */
export function FilterBar({
  filters,
  onToggleAgent,
  onToggleStatus,
  onSortPress,
}: FilterBarProps) {
  const handleSortPress = useCallback(() => {
    Haptics.selectionAsync()
    onSortPress()
  }, [onSortPress])

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Agent Filters */}
        <View style={styles.filterGroup}>
          <FilterPill
            label="Plan"
            active={filters.agents.has('plan')}
            onPress={() => onToggleAgent('plan')}
            icon={<AgentModeBadge agent="plan" size={10} />}
            testID="filter-plan"
          />
          <FilterPill
            label="Build"
            active={filters.agents.has('build')}
            onPress={() => onToggleAgent('build')}
            icon={<AgentModeBadge agent="build" size={10} />}
            testID="filter-build"
          />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Status Filters */}
        <View style={styles.filterGroup}>
          <FilterPill
            label="Running"
            active={filters.statuses.has('running')}
            onPress={() => onToggleStatus('running')}
            icon={
              filters.statuses.has('running') ? (
                <BrailleSpinner size={10} color={Colors.text} />
              ) : (
                <BrailleSpinner size={10} color={Colors.textMuted} />
              )
            }
            testID="filter-running"
          />
          <FilterPill
            label="Completed"
            active={filters.statuses.has('completed')}
            onPress={() => onToggleStatus('completed')}
            icon={
              <MaterialCommunityIcons
                name="check"
                size={12}
                color={filters.statuses.has('completed') ? Colors.text : Colors.textMuted}
              />
            }
            testID="filter-completed"
          />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Sort Button */}
        <Pressable
          style={styles.sortButton}
          onPress={handleSortPress}
          testID="sort-button"
        >
          <MaterialCommunityIcons
            name="arrow-down"
            size={14}
            color={filters.sortPreset !== 'recent' ? Colors.text : Colors.textMuted}
          />
          <Text
            style={[
              styles.sortLabel,
              filters.sortPreset !== 'recent' && styles.sortLabelActive,
            ]}
          >
            {SORT_LABELS[filters.sortPreset]}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xs,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  sortLabelActive: {
    color: Colors.text,
  },
})
