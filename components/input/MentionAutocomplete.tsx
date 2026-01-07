/**
 * MentionAutocomplete component for @agent mentions.
 */

import { useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';
import { AGENTS, AgentType } from '@/types';

interface MentionAutocompleteProps {
  query: string;
  onSelect: (agent: AgentType) => void;
  onDismiss: () => void;
  visible: boolean;
}

export function MentionAutocomplete({
  query,
  onSelect,
  onDismiss,
  visible,
}: MentionAutocompleteProps) {
  const filteredAgents = useMemo(() => {
    const agents = Object.values(AGENTS);
    if (!query) return agents;

    const lowerQuery = query.toLowerCase();
    return agents.filter(
      (agent) =>
        agent.displayName.toLowerCase().includes(lowerQuery) ||
        agent.type.toLowerCase().includes(lowerQuery)
    );
  }, [query]);

  if (!visible || filteredAgents.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150).springify()}
      exiting={FadeOut.duration(100)}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>Mention Agent</Text>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={16} color={Colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {filteredAgents.map((agent) => (
          <Pressable
            key={agent.type}
            style={({ pressed }) => [
              styles.agentItem,
              pressed && styles.agentItemPressed,
            ]}
            onPress={() => onSelect(agent.type)}
          >
            <View style={styles.agentIcon}>
              <MaterialCommunityIcons
                name={agent.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                size={18}
                color={Colors.cyan}
              />
            </View>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>@{agent.type}</Text>
              <Text style={styles.agentDescription} numberOfLines={1}>
                {agent.description}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
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
  agentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  agentItemPressed: {
    backgroundColor: Colors.backgroundTertiary,
  },
  agentIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(0, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.cyan,
  },
  agentDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
