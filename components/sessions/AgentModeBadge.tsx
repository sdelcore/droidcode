import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { AgentType } from '@/types';
import { Colors } from '@/constants/Theme';

interface AgentModeBadgeProps {
  agent?: AgentType;
  size?: number;
  style?: TextStyle;
}

/**
 * Colored dot indicator showing which agent mode was used in a session.
 * 
 * Colors:
 * - Plan (blue): Planning/thinking mode
 * - Build (orange): Active coding mode
 * - Shell (green): Command execution mode
 * - General/Unknown (gray): Other modes
 * 
 * Usage:
 * <AgentModeBadge agent="plan" size={8} />
 */
export function AgentModeBadge({ agent, size = 8, style }: AgentModeBadgeProps) {
  const color = getAgentColor(agent);

  return (
    <Text
      style={[
        styles.dot,
        { color, fontSize: size },
        style,
      ]}
    >
      ●
    </Text>
  );
}

function getAgentColor(agent?: AgentType): string {
  switch (agent) {
    case 'plan':
      return Colors.agentPlan; // Blue - planning/thinking
    case 'build':
      return Colors.agentBuild; // Green - building/coding
    case 'shell':
      return Colors.agentShell; // Terminal green - executing commands
    case 'explore':
      return Colors.agentExplore; // Orange - exploring codebase
    case 'general':
    default:
      return Colors.agentGeneral; // Purple - general/unknown
  }
}

const styles = StyleSheet.create({
  dot: {
    lineHeight: 14,
  },
});
