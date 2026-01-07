/**
 * Inline indicator showing that a message was interrupted.
 * Matches OpenCode's terminal UI pattern.
 */

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme';

interface InterruptedIndicatorProps {
  compact?: boolean;  // Smaller variant for inline use
}

export function InterruptedIndicator({ compact = false }: InterruptedIndicatorProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <MaterialCommunityIcons
        name="stop-circle-outline"
        size={compact ? 12 : 14}
        color={Colors.warning}
      />
      <Text style={[styles.text, compact && styles.textCompact]}>
        Interrupted
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(210, 195, 107, 0.1)',
    borderRadius: BorderRadius.sm,
    borderLeftWidth: 2,
    borderLeftColor: Colors.warning,
    marginTop: Spacing.sm,
  },
  containerCompact: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
  },
  text: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.mono,
    color: Colors.warning,
    fontWeight: '500',
  },
  textCompact: {
    fontSize: 10,
  },
});
