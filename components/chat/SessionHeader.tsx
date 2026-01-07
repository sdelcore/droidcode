/**
 * Custom header for session screen showing project breadcrumb and session title.
 */

import { View, StyleSheet } from 'react-native'

import { Text } from '@/components/Themed'
import { Colors, Spacing, FontSize } from '@/constants/Theme'

interface SessionHeaderProps {
  projectName: string
  sessionTitle?: string
}

export function SessionHeader({ projectName, sessionTitle }: SessionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.breadcrumb} numberOfLines={1}>
        {projectName}
      </Text>
      <Text style={styles.title} numberOfLines={2}>
        {sessionTitle || 'New Session'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: Spacing.md,
  },
  breadcrumb: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  title: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '600',
    lineHeight: FontSize.md * 1.3,
  },
})
