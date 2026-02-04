import { useCallback } from 'react'
import { StyleSheet, Pressable, Modal } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { View, Text } from '@/components/Themed'
import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme'
import type { SortPreset } from '@/types/domain'

interface SortOption {
  value: SortPreset
  label: string
  description: string
  icon: keyof typeof MaterialCommunityIcons.glyphMap
}

const SORT_OPTIONS: SortOption[] = [
  {
    value: 'recent',
    label: 'Recent Activity',
    description: 'Most recently active first',
    icon: 'clock-outline',
  },
  {
    value: 'workflow',
    label: 'Workflow Priority',
    description: 'Plans -> Builds, Done -> Active',
    icon: 'format-list-numbered',
  },
  {
    value: 'created',
    label: 'Creation Date',
    description: 'Newest sessions first',
    icon: 'calendar-plus',
  },
  {
    value: 'duration',
    label: 'Duration',
    description: 'Longest running first',
    icon: 'timer-outline',
  },
  {
    value: 'files',
    label: 'Files Changed',
    description: 'Most changes first',
    icon: 'file-multiple-outline',
  },
  {
    value: 'alpha',
    label: 'Alphabetical',
    description: 'A to Z by title',
    icon: 'sort-alphabetical-ascending',
  },
]

interface SortOptionsModalProps {
  visible: boolean
  currentSort: SortPreset
  onSelect: (sort: SortPreset) => void
  onClose: () => void
}

/**
 * Modal for selecting session sort order.
 * Displays radio button options with descriptions.
 */
export function SortOptionsModal({
  visible,
  currentSort,
  onSelect,
  onClose,
}: SortOptionsModalProps) {
  const handleSelect = useCallback((sort: SortPreset) => {
    Haptics.selectionAsync()
    onSelect(sort)
    onClose()
  }, [onSelect, onClose])

  const handleBackdropPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onClose()
  }, [onClose])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Sort Sessions</Text>
          
          {SORT_OPTIONS.map((option) => {
            const isSelected = currentSort === option.value
            
            return (
              <Pressable
                key={option.value}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => handleSelect(option.value)}
              >
                <View style={styles.radioContainer}>
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                </View>
                
                <View style={styles.optionContent}>
                  <View style={styles.optionHeader}>
                    <MaterialCommunityIcons
                      name={option.icon}
                      size={16}
                      color={isSelected ? Colors.text : Colors.textMuted}
                    />
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                      {option.label}
                    </Text>
                  </View>
                  <Text style={styles.optionDescription}>
                    {option.description}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  optionSelected: {
    backgroundColor: Colors.backgroundTertiary,
  },
  radioContainer: {
    paddingTop: 2,
    marginRight: Spacing.md,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  optionContent: {
    flex: 1,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  optionLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.mono,
    color: Colors.textMuted,
  },
  optionLabelSelected: {
    color: Colors.text,
  },
  optionDescription: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginLeft: Spacing.xl + Spacing.xs,
  },
})
