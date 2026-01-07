/**
 * DiffPanel component for displaying file changes.
 * Shows additions and deletions for modified files.
 */

import React, { useState, useMemo } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme';
import type { FileDiffDto } from '@/types';

interface DiffPanelProps {
  files: FileDiffDto[];
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
  onFilePress?: (file: FileDiffDto) => void;
}

export function DiffPanel({
  files,
  isCollapsible = true,
  defaultExpanded = false,
  onFilePress,
}: DiffPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const expandProgress = useSharedValue(defaultExpanded ? 1 : 0);

  React.useEffect(() => {
    expandProgress.value = withTiming(expanded ? 1 : 0, { duration: 250 });
  }, [expanded, expandProgress]);

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: expandProgress.value * 400,
    opacity: expandProgress.value,
    overflow: 'hidden' as const,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${expandProgress.value * 90}deg` }],
  }));

  const stats = useMemo(() => {
    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
    return { totalAdditions, totalDeletions, fileCount: files.length };
  }, [files]);

  if (files.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.header}
        onPress={() => isCollapsible && setExpanded(!expanded)}
        disabled={!isCollapsible}
      >
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="source-branch"
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.title}>Changes</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{stats.fileCount} files</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.statsContainer}>
            <Text style={styles.statsAdditions}>+{stats.totalAdditions}</Text>
            <Text style={styles.statsDeletions}>-{stats.totalDeletions}</Text>
          </View>
          {isCollapsible && (
            <Animated.View style={chevronStyle}>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={Colors.textMuted}
              />
            </Animated.View>
          )}
        </View>
      </Pressable>

      <Animated.View style={contentStyle}>
        <ScrollView
          style={styles.content}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {files.map((file, index) => (
            <DiffFileItem
              key={file.path || index}
              file={file}
              onPress={onFilePress ? () => onFilePress(file) : undefined}
            />
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/**
 * Compact diff summary for inline display.
 */
export function DiffSummary({ files }: { files: FileDiffDto[] }) {
  const stats = useMemo(() => {
    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
    return { totalAdditions, totalDeletions, fileCount: files.length };
  }, [files]);

  if (files.length === 0) {
    return null;
  }

  return (
    <View style={styles.summaryContainer}>
      <MaterialCommunityIcons
        name="source-branch"
        size={14}
        color={Colors.textMuted}
      />
      <Text style={styles.summaryText}>
        {stats.fileCount} file{stats.fileCount !== 1 ? 's' : ''}
      </Text>
      <View style={styles.summaryStats}>
        <Text style={styles.summaryAdditions}>+{stats.totalAdditions}</Text>
        <Text style={styles.summaryDeletions}>-{stats.totalDeletions}</Text>
      </View>
    </View>
  );
}

interface DiffFileItemProps {
  file: FileDiffDto;
  onPress?: () => void;
}

function DiffFileItem({ file, onPress }: DiffFileItemProps) {
  const fileName = getFileName(file.path);
  const dirPath = getDirPath(file.path);
  const fileIcon = getFileIcon(file.path);
  const changeType = getChangeType(file.additions, file.deletions);

  return (
    <Pressable
      style={styles.fileItem}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.fileIconContainer}>
        <MaterialCommunityIcons
          name={fileIcon}
          size={18}
          color={getFileColor(file.path)}
        />
      </View>

      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName}
        </Text>
        {dirPath && (
          <Text style={styles.filePath} numberOfLines={1}>
            {dirPath}
          </Text>
        )}
      </View>

      <View style={styles.fileStats}>
        <DiffBar additions={file.additions} deletions={file.deletions} />
        <View style={styles.fileNumbers}>
          {file.additions > 0 && (
            <Text style={styles.fileAdditions}>+{file.additions}</Text>
          )}
          {file.deletions > 0 && (
            <Text style={styles.fileDeletions}>-{file.deletions}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

interface DiffBarProps {
  additions: number;
  deletions: number;
  maxBlocks?: number;
}

function DiffBar({ additions, deletions, maxBlocks = 5 }: DiffBarProps) {
  const total = additions + deletions;
  if (total === 0) return null;

  const addBlocks = Math.ceil((additions / total) * maxBlocks);
  const delBlocks = maxBlocks - addBlocks;

  return (
    <View style={styles.diffBar}>
      {Array.from({ length: addBlocks }).map((_, i) => (
        <View key={`add-${i}`} style={styles.diffBlockAdd} />
      ))}
      {Array.from({ length: delBlocks }).map((_, i) => (
        <View key={`del-${i}`} style={styles.diffBlockDel} />
      ))}
    </View>
  );
}

/**
 * DiffView component for showing actual diff content.
 */
interface DiffViewProps {
  oldContent?: string;
  newContent?: string;
  hunks?: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export function DiffView({ hunks }: DiffViewProps) {
  if (!hunks || hunks.length === 0) {
    return (
      <View style={styles.emptyDiff}>
        <Text style={styles.emptyDiffText}>No diff available</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.diffView} horizontal>
      <View style={styles.diffContent}>
        {hunks.map((hunk, hunkIndex) => (
          <View key={hunkIndex} style={styles.hunk}>
            <Text style={styles.hunkHeader}>
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            </Text>
            {hunk.lines.map((line, lineIndex) => (
              <View
                key={lineIndex}
                style={[
                  styles.diffLine,
                  line.type === 'add' && styles.diffLineAdd,
                  line.type === 'remove' && styles.diffLineRemove,
                ]}
              >
                <View style={styles.lineNumbers}>
                  <Text style={styles.lineNumber}>
                    {line.oldLineNumber || ' '}
                  </Text>
                  <Text style={styles.lineNumber}>
                    {line.newLineNumber || ' '}
                  </Text>
                </View>
                <Text style={styles.linePrefix}>
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </Text>
                <Text
                  style={[
                    styles.lineContent,
                    line.type === 'add' && styles.lineContentAdd,
                    line.type === 'remove' && styles.lineContentRemove,
                  ]}
                >
                  {line.content}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function getFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function getDirPath(path: string): string | null {
  const parts = path.split('/');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('/');
}

function getFileIcon(path: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'language-typescript';
    case 'js':
    case 'jsx':
      return 'language-javascript';
    case 'py':
      return 'language-python';
    case 'kt':
    case 'kts':
      return 'language-kotlin';
    case 'java':
      return 'language-java';
    case 'swift':
      return 'language-swift';
    case 'go':
      return 'language-go';
    case 'rs':
      return 'language-rust';
    case 'json':
      return 'code-json';
    case 'yaml':
    case 'yml':
      return 'file-cog';
    case 'md':
      return 'language-markdown';
    case 'css':
    case 'scss':
    case 'sass':
      return 'language-css3';
    case 'html':
      return 'language-html5';
    case 'xml':
      return 'file-xml-box';
    case 'sql':
      return 'database';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'console';
    case 'dockerfile':
      return 'docker';
    default:
      return 'file-document-outline';
  }
}

function getFileColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
      return '#3178C6';
    case 'js':
    case 'jsx':
      return '#F7DF1E';
    case 'py':
      return '#3776AB';
    case 'kt':
    case 'kts':
      return '#A97BFF';
    case 'java':
      return '#B07219';
    case 'swift':
      return '#FA7343';
    case 'go':
      return '#00ADD8';
    case 'rs':
      return '#DEA584';
    case 'json':
      return '#CB8742';
    case 'md':
      return '#083FA1';
    case 'css':
    case 'scss':
      return '#563D7C';
    case 'html':
      return '#E34F26';
    default:
      return Colors.textSecondary;
  }
}

function getChangeType(
  additions: number,
  deletions: number
): 'added' | 'modified' | 'deleted' {
  if (additions > 0 && deletions === 0) return 'added';
  if (additions === 0 && deletions > 0) return 'deleted';
  return 'modified';
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  countBadge: {
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  countText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statsAdditions: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.diffAdded,
  },
  statsDeletions: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.diffRemoved,
  },
  content: {
    maxHeight: 300,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  fileIconContainer: {
    width: 24,
    alignItems: 'center',
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.text,
  },
  filePath: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  fileStats: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  diffBar: {
    flexDirection: 'row',
    gap: 1,
  },
  diffBlockAdd: {
    width: 8,
    height: 8,
    backgroundColor: Colors.diffAdded,
    borderRadius: 1,
  },
  diffBlockDel: {
    width: 8,
    height: 8,
    backgroundColor: Colors.diffRemoved,
    borderRadius: 1,
  },
  fileNumbers: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  fileAdditions: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    color: Colors.diffAdded,
  },
  fileDeletions: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    color: Colors.diffRemoved,
  },
  // Summary styles
  summaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  summaryText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    flex: 1,
  },
  summaryStats: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  summaryAdditions: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.diffAdded,
  },
  summaryDeletions: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.diffRemoved,
  },
  // DiffView styles
  diffView: {
    backgroundColor: Colors.backgroundCode,
    borderRadius: BorderRadius.md,
    maxHeight: 400,
  },
  diffContent: {
    padding: Spacing.sm,
  },
  hunk: {
    marginBottom: Spacing.md,
  },
  hunkHeader: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.mono,
    color: Colors.purple,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  diffLine: {
    flexDirection: 'row',
    paddingVertical: 1,
    paddingHorizontal: Spacing.xs,
  },
  diffLineAdd: {
    backgroundColor: Colors.diffAddedBackground,
  },
  diffLineRemove: {
    backgroundColor: Colors.diffRemovedBackground,
  },
  lineNumbers: {
    flexDirection: 'row',
    marginRight: Spacing.sm,
  },
  lineNumber: {
    width: 30,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  linePrefix: {
    width: 12,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
    color: Colors.textMuted,
  },
  lineContent: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
    color: Colors.text,
  },
  lineContentAdd: {
    color: Colors.diffAdded,
  },
  lineContentRemove: {
    color: Colors.diffRemoved,
  },
  emptyDiff: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyDiffText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
});
