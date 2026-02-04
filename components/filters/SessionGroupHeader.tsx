import { StyleSheet } from 'react-native'

import { View, Text } from '@/components/Themed'
import { Colors, Spacing, FontSize, FontFamily } from '@/constants/Theme'

interface SessionGroupHeaderProps {
  label: string
  count: number
}

/**
 * Terminal-style section header for grouped sessions.
 * Displays as: ━━ Label (count) ━━━━━━━━━━━━━
 */
export function SessionGroupHeader({ label, count }: SessionGroupHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.line}>━━</Text>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.count}>({count})</Text>
      <Text style={styles.line}>━━━━━━━━━━━━━━━━━━</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  line: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  label: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  count: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
})
