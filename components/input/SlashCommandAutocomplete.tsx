/**
 * SlashCommandAutocomplete component for displaying slash command suggestions.
 */

import { useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';
import type { SlashCommand } from '@/types';

interface SlashCommandAutocompleteProps {
  query: string;
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  onDismiss: () => void;
  visible: boolean;
}

export function SlashCommandAutocomplete({
  query,
  commands,
  onSelect,
  onDismiss,
  visible,
}: SlashCommandAutocompleteProps) {
  const filteredCommands = useMemo(() => {
    if (!query) return commands.slice(0, 6);

    const lowerQuery = query.toLowerCase();
    return commands
      .filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(lowerQuery) ||
          cmd.description.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 6);
  }, [commands, query]);

  if (!visible || filteredCommands.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150).springify()}
      exiting={FadeOut.duration(100)}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>Slash Commands</Text>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={16} color={Colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {filteredCommands.map((command) => (
          <Pressable
            key={command.name}
            style={({ pressed }) => [
              styles.commandItem,
              pressed && styles.commandItemPressed,
            ]}
            onPress={() => onSelect(command)}
          >
            <View style={styles.commandIcon}>
              <MaterialCommunityIcons
                name={getCommandIcon(command.name)}
                size={18}
                color={Colors.primary}
              />
            </View>
            <View style={styles.commandInfo}>
              <Text style={styles.commandName}>/{command.name}</Text>
              <Text style={styles.commandDescription} numberOfLines={1}>
                {command.description}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function getCommandIcon(name: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const iconMap: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
    help: 'help-circle',
    clear: 'broom',
    config: 'cog',
    init: 'rocket-launch',
    review: 'code-tags-check',
    commit: 'source-commit',
    pr: 'source-pull',
    bug: 'bug',
    test: 'test-tube',
    doc: 'file-document',
    compact: 'arrow-collapse-all',
    status: 'information',
    cost: 'currency-usd',
    model: 'brain',
    shell: 'console',
  };

  return iconMap[name.toLowerCase()] || 'slash-forward-box';
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomWidth: 0,
    maxHeight: 280,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: {
    flexGrow: 0,
  },
  commandItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  commandItemPressed: {
    backgroundColor: Colors.backgroundTertiary,
  },
  commandIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandInfo: {
    flex: 1,
  },
  commandName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  commandDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
