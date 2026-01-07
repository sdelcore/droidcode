/**
 * MessageGroup component for displaying grouped chat messages.
 * Renders consecutive assistant messages as a single visual block with one header.
 */

import React, { useMemo, useCallback } from 'react';
import { StyleSheet, View, Text, Pressable, Image, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius, FontSize, FontFamily, getAgentColor } from '@/constants/Theme';
import type { MessageGroup as MessageGroupType, MessagePartDto } from '@/types';
import { StreamingText } from './StreamingText';
import { ThinkingBlock, ThinkingIndicator } from './ThinkingBlock';
import { ToolUseBlock } from './ToolUseBlock';
import { CodeBlock } from './CodeBlock';
import { InterruptedIndicator } from './InterruptedIndicator';

interface MessageGroupProps {
  group: MessageGroupType;
  onRevert?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  isInterrupted?: boolean;
}

export const MessageGroup = React.memo(function MessageGroup({
  group,
  onRevert,
  onFork,
  isInterrupted,
}: MessageGroupProps) {
  const isUser = group.role === 'user';
  const agentColor = getAgentColor(group.agent);

  // Flatten all parts from all messages in the group
  // Optimized: memoize based on messages array to prevent unnecessary recalculations
  const allParts = useMemo(() => {
    return group.messages.flatMap(m => m.parts);
  }, [group.messages]);

  const hasContent = allParts.length > 0;

  // For actions, use the last message ID in the group
  const lastMessageId = group.messages[group.messages.length - 1]?.id;

  const handleLongPress = useCallback(() => {
    if (group.isStreaming || isUser) return;

    const actions: { text: string; onPress: () => void; style?: 'cancel' | 'destructive' }[] = [
      {
        text: 'Revert to here',
        onPress: () => onRevert?.(lastMessageId),
      },
      {
        text: 'Fork from here',
        onPress: () => onFork?.(lastMessageId),
      },
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {},
      },
    ];

    Alert.alert(
      'Message Actions',
      'Choose an action for this message',
      actions
    );
  }, [lastMessageId, group.isStreaming, isUser, onRevert, onFork]);

  // Find the last text part index for streaming cursor
  const lastTextPartIndex = useMemo(() => {
    for (let i = allParts.length - 1; i >= 0; i--) {
      if (allParts[i].type === 'text') {
        return i;
      }
    }
    return -1;
  }, [allParts]);

  const renderPart = (part: MessagePartDto, index: number) => {
    const isLastTextPart = index === lastTextPartIndex;
    const isPartStreaming = group.isStreaming && isLastTextPart;

    switch (part.type) {
      case 'text':
        return (
          <View key={index} style={styles.partContainer}>
            <StreamingText
              text={part.text || ''}
              isStreaming={isPartStreaming}
            />
          </View>
        );

      case 'thinking':
      case 'reasoning':
        return (
          <ThinkingBlock
            key={index}
            text={part.text || ''}
            isThinking={part.type === 'thinking'}
            isStreaming={group.isStreaming && index === allParts.length - 1}
            defaultExpanded={group.isStreaming}
          />
        );

      case 'tool':
        const toolName = part.tool || part.toolName || 'Unknown Tool';
        return (
          <ToolUseBlock
            key={index}
            toolName={toolName}
            status={part.state?.status || 'pending'}
            input={part.state?.input || part.input}
            output={part.state?.output || part.output}
            error={part.state?.error}
            title={part.state?.title}
            isStreaming={
              group.isStreaming &&
              index === allParts.length - 1 &&
              part.state?.status === 'running'
            }
          />
        );

      case 'code':
        return (
          <CodeBlock
            key={index}
            code={part.text || ''}
            language={part.language}
            isStreaming={group.isStreaming && index === allParts.length - 1}
          />
        );

      case 'file':
        return (
          <FilePreview
            key={index}
            url={part.url}
            mime={part.mime}
            filename={part.filename}
          />
        );

      default:
        // Unknown part type - render as text if there's content
        if (part.text) {
          return (
            <View key={index} style={styles.partContainer}>
              <Text style={styles.unknownPartText}>{part.text}</Text>
            </View>
          );
        }
        return null;
    }
  };

  const canShowActions = !isUser && !group.isStreaming && (onRevert || onFork);

  return (
    <View style={styles.container}>
      {/* Role/Agent label - single header for entire group */}
      <View style={styles.labelRow}>
        <MaterialCommunityIcons
          name={isUser ? 'account' : getAgentIcon(group.agent || '')}
          size={14}
          color={agentColor}
        />
        <Text style={[styles.roleLabel, isUser && styles.roleLabelUser]}>
          {isUser ? 'you' : (group.agent || 'assistant')}
        </Text>
        {canShowActions && (
          <Pressable onPress={handleLongPress} hitSlop={8}>
            <MaterialCommunityIcons
              name="dots-horizontal"
              size={16}
              color={Colors.textMuted}
            />
          </Pressable>
        )}
      </View>

      <Pressable
        onLongPress={canShowActions ? handleLongPress : undefined}
        delayLongPress={500}
      >
        <View style={[styles.messageBox, { borderLeftWidth: 3, borderLeftColor: agentColor }]}>
          {hasContent ? (
            allParts.map(renderPart)
          ) : group.isStreaming ? (
            <ThinkingIndicator label="Starting..." />
          ) : (
            <Text style={styles.emptyText}>(empty message)</Text>
          )}
          {isInterrupted && <InterruptedIndicator />}
        </View>
      </Pressable>
    </View>
  );
});

/**
 * FilePreview component for image/file attachments.
 */
function FilePreview({
  url,
  mime,
  filename,
}: {
  url?: string;
  mime?: string;
  filename?: string;
}) {
  const isImage = mime?.startsWith('image/');

  if (!url) {
    return (
      <View style={styles.fileContainer}>
        <MaterialCommunityIcons
          name="file-question"
          size={24}
          color={Colors.textMuted}
        />
        <Text style={styles.fileName}>Missing file URL</Text>
      </View>
    );
  }

  if (isImage) {
    return (
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: url }}
          style={styles.image}
          resizeMode="contain"
        />
        {filename && (
          <Text style={styles.imageFilename} numberOfLines={1}>
            {filename}
          </Text>
        )}
      </View>
    );
  }

  // Non-image file
  return (
    <Pressable style={styles.fileContainer}>
      <MaterialCommunityIcons
        name={getFileIcon(mime)}
        size={24}
        color={Colors.primary}
      />
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {filename || 'File'}
        </Text>
        {mime && (
          <Text style={styles.fileMime}>{mime}</Text>
        )}
      </View>
    </Pressable>
  );
}

function getAgentIcon(agent: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const name = agent.toLowerCase();
  if (name.includes('plan')) return 'file-document-outline';
  if (name.includes('build')) return 'hammer';
  if (name.includes('shell')) return 'console';
  if (name.includes('explore')) return 'magnify';
  return 'robot';
}

function getFileIcon(mime?: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (!mime) return 'file';
  if (mime.includes('pdf')) return 'file-pdf-box';
  if (mime.includes('word') || mime.includes('document')) return 'file-word-box';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'file-excel-box';
  if (mime.includes('zip') || mime.includes('archive')) return 'folder-zip';
  if (mime.includes('audio')) return 'file-music';
  if (mime.includes('video')) return 'file-video';
  if (mime.includes('text')) return 'file-document';
  return 'file';
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
    paddingHorizontal: 2,
  },
  roleLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: FontFamily.mono,
    flex: 1,
  },
  roleLabelUser: {
    color: Colors.primary,
  },
  messageBox: {
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    width: '100%',
  },
  partContainer: {
    marginVertical: Spacing.xs,
  },
  unknownPartText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    fontFamily: FontFamily.mono,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    fontStyle: 'italic',
    fontFamily: FontFamily.mono,
  },
  // File preview styles
  imageContainer: {
    marginVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundCode,
  },
  image: {
    width: '100%',
    height: 200,
    minWidth: 150,
  },
  imageFilename: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    padding: Spacing.sm,
    backgroundColor: Colors.backgroundTertiary,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.xs,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  fileMime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
