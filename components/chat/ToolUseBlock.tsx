/**
 * ToolUseBlock component for displaying tool invocations.
 * Shows tool name, status, input, and output with proper formatting.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  interpolate,
  Extrapolation,
  cancelAnimation,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme';
import type { ToolStatus } from '@/types';

interface ToolUseBlockProps {
  toolName: string;
  status?: ToolStatus;
  input?: unknown;
  output?: string;
  error?: string;
  title?: string;
  isStreaming?: boolean;
}

export const ToolUseBlock = React.memo(function ToolUseBlock({
  toolName,
  status = 'pending',
  input,
  output,
  error,
  title,
  isStreaming = false,
}: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [showOutput, setShowOutput] = useState(false);

  const rotation = useSharedValue(0);
  const spinValue = useSharedValue(0);

  useEffect(() => {
    if (status === 'running' || isStreaming) {
      spinValue.value = withRepeat(
        withTiming(360, { duration: 1500 }),
        -1,
        false
      );
    } else {
      cancelAnimation(spinValue);
      spinValue.value = 0;
    }

    return () => {
      cancelAnimation(spinValue);
    };
  }, [status, isStreaming, spinValue]);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 1 : 0, { duration: 200 });
  }, [expanded, rotation]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinValue.value}deg` }],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(rotation.value, [0, 1], [0, 90])}deg` },
    ],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(
      rotation.value,
      [0, 1],
      [0, 2000],
      Extrapolation.CLAMP
    ),
    opacity: rotation.value,
  }));

  const statusInfo = getStatusInfo(status);
  const displayName = getDisplayName(toolName);
  const displayTitle = title || formatToolTitle(toolName, input);

  const formattedInput = useMemo(() => {
    if (!input) return null;
    try {
      if (typeof input === 'string') {
        // Try to parse as JSON
        const parsed = JSON.parse(input);
        return JSON.stringify(parsed, null, 2);
      }
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  }, [input]);

  const hasDetails = Boolean(formattedInput || output || error);

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.header}
        onPress={() => hasDetails && setExpanded(!expanded)}
        disabled={!hasDetails}
      >
        <View style={styles.iconContainer}>
          {status === 'running' || isStreaming ? (
            <Animated.View style={iconAnimatedStyle}>
              <MaterialCommunityIcons
                name="loading"
                size={18}
                color={statusInfo.color}
              />
            </Animated.View>
          ) : (
            <MaterialCommunityIcons
              name={getToolIcon(toolName)}
              size={18}
              color={statusInfo.color}
            />
          )}
        </View>

        <View style={styles.headerContent}>
          <Text style={styles.toolName} numberOfLines={1}>
            {displayName}
          </Text>
          {displayTitle && displayTitle !== displayName && (
            <Text style={styles.toolTitle} numberOfLines={1}>
              {displayTitle}
            </Text>
          )}
        </View>

        <View style={styles.headerRight}>
          <View
            style={[styles.statusBadge, { backgroundColor: statusInfo.bgColor }]}
          >
            <MaterialCommunityIcons
              name={statusInfo.icon}
              size={12}
              color={statusInfo.color}
            />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>

          {hasDetails && (
            <Animated.View style={chevronStyle}>
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={Colors.textMuted}
              />
            </Animated.View>
          )}
        </View>
      </Pressable>

      {hasDetails && (
        <Animated.View style={[styles.content, contentStyle]}>
          {error && (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons
                name="alert-circle"
                size={14}
                color={Colors.error}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {formattedInput && (
            <View style={styles.section}>
              <Pressable
                style={styles.sectionHeader}
                onPress={() => setShowInput(!showInput)}
              >
                <Text style={styles.sectionLabel}>Input</Text>
                <MaterialCommunityIcons
                  name={showInput ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textMuted}
                />
              </Pressable>
              {showInput && (
                <ScrollView
                  style={styles.codeContainer}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  <Text style={styles.codeText}>{formattedInput}</Text>
                </ScrollView>
              )}
            </View>
          )}

          {output && (
            <View style={styles.section}>
              <Pressable
                style={styles.sectionHeader}
                onPress={() => setShowOutput(!showOutput)}
              >
                <Text style={styles.sectionLabel}>Output</Text>
                <Text style={styles.outputSize}>
                  {output.length > 1000
                    ? `${Math.round(output.length / 1024)}KB`
                    : `${output.length} chars`}
                </Text>
                <MaterialCommunityIcons
                  name={showOutput ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.textMuted}
                />
              </Pressable>
              {showOutput && (
                <ScrollView
                  style={styles.outputContainer}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  <Text style={styles.outputText} selectable>
                    {output.length > 5000
                      ? output.substring(0, 5000) + '\n\n... (truncated)'
                      : output}
                  </Text>
                </ScrollView>
              )}
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
});

function getStatusInfo(status: ToolStatus): {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bgColor: string;
  label: string;
} {
  switch (status) {
    case 'pending':
      return {
        icon: 'clock-outline',
        color: Colors.toolPending,
        bgColor: 'rgba(136, 136, 136, 0.15)',
        label: 'Pending',
      };
    case 'running':
      return {
        icon: 'loading',
        color: Colors.toolRunning,
        bgColor: 'rgba(0, 122, 255, 0.15)',
        label: 'Running',
      };
    case 'completed':
      return {
        icon: 'check-circle-outline',
        color: Colors.toolCompleted,
        bgColor: 'rgba(48, 209, 88, 0.15)',
        label: 'Done',
      };
    case 'failed':
    case 'error':
      return {
        icon: 'alert-circle-outline',
        color: Colors.toolFailed,
        bgColor: 'rgba(255, 69, 58, 0.15)',
        label: 'Failed',
      };
    default:
      return {
        icon: 'cog-outline',
        color: Colors.textMuted,
        bgColor: 'rgba(136, 136, 136, 0.15)',
        label: String(status),
      };
  }
}

function getToolIcon(
  toolName: string
): keyof typeof MaterialCommunityIcons.glyphMap {
  const name = toolName.toLowerCase();

  if (name.includes('read') || name.includes('file')) return 'file-document-outline';
  if (name.includes('write') || name.includes('edit')) return 'pencil';
  if (name.includes('bash') || name.includes('shell') || name.includes('command'))
    return 'console';
  if (name.includes('glob') || name.includes('search') || name.includes('grep'))
    return 'magnify';
  if (name.includes('web') || name.includes('fetch') || name.includes('http'))
    return 'web';
  if (name.includes('todo')) return 'checkbox-marked-outline';
  if (name.includes('agent') || name.includes('task')) return 'robot';
  if (name.includes('diff') || name.includes('git')) return 'source-branch';
  if (name.includes('notebook')) return 'notebook';

  return 'cog';
}

function getDisplayName(toolName: string): string {
  // Convert camelCase or snake_case to Title Case
  return toolName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function formatToolTitle(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;

  const inputObj = input as Record<string, unknown>;

  // Extract meaningful info based on tool type
  const name = toolName.toLowerCase();

  if (name.includes('read') || name.includes('write') || name.includes('edit')) {
    const path = inputObj.file_path || inputObj.path || inputObj.file;
    if (typeof path === 'string') {
      // Get filename from path
      const parts = path.split('/');
      return parts[parts.length - 1];
    }
  }

  if (name.includes('bash') || name.includes('shell')) {
    const cmd = inputObj.command || inputObj.cmd;
    if (typeof cmd === 'string') {
      // Truncate long commands
      return cmd.length > 50 ? cmd.substring(0, 47) + '...' : cmd;
    }
  }

  if (name.includes('glob') || name.includes('search')) {
    const pattern = inputObj.pattern || inputObj.query;
    if (typeof pattern === 'string') {
      return pattern;
    }
  }

  if (name.includes('grep')) {
    const pattern = inputObj.pattern;
    if (typeof pattern === 'string') {
      return `/${pattern}/`;
    }
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.xs,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    flex: 1,
    gap: 2,
  },
  toolName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  toolTitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  content: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    overflow: 'hidden',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.diffRemovedBackground,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.error,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    flex: 1,
  },
  outputSize: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  codeContainer: {
    backgroundColor: Colors.backgroundCode,
    padding: Spacing.md,
    maxHeight: 200,
  },
  codeText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
    color: Colors.text,
    lineHeight: 20,
  },
  outputContainer: {
    backgroundColor: Colors.backgroundCode,
    padding: Spacing.md,
    maxHeight: 300,
  },
  outputText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
    color: Colors.text,
    lineHeight: 20,
  },
});
