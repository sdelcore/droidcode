/**
 * MessageBubble component for displaying chat messages.
 * Handles all message part types: text, thinking, tool, code, file.
 */

import { useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, Text, Pressable, Image, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme';
import type { MessageDto, MessagePartDto } from '@/types';
import { StreamingText, PulsingCursor } from './StreamingText';
import { ThinkingBlock, ThinkingIndicator } from './ThinkingBlock';
import { ToolUseBlock } from './ToolUseBlock';
import { CodeBlock } from './CodeBlock';

interface MessageBubbleProps {
  message: MessageDto;
  isStreaming?: boolean;
  onRevert?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
}

export function MessageBubble({
  message,
  isStreaming = false,
  onRevert,
  onFork,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasContent = message.parts.length > 0;
  const [showActions, setShowActions] = useState(false);

  const handleLongPress = useCallback(() => {
    if (isStreaming || isUser) return;

    const actions: { text: string; onPress: () => void; style?: 'cancel' | 'destructive' }[] = [
      {
        text: 'Revert to here',
        onPress: () => onRevert?.(message.id),
      },
      {
        text: 'Fork from here',
        onPress: () => onFork?.(message.id),
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
  }, [message.id, isStreaming, isUser, onRevert, onFork]);

  // Determine if the last text part is the one being streamed
  const lastTextPartIndex = useMemo(() => {
    for (let i = message.parts.length - 1; i >= 0; i--) {
      if (message.parts[i].type === 'text') {
        return i;
      }
    }
    return -1;
  }, [message.parts]);

  const renderPart = (part: MessagePartDto, index: number) => {
    const isLastTextPart = index === lastTextPartIndex;
    const isPartStreaming = isStreaming && isLastTextPart;

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
            isStreaming={isStreaming && index === message.parts.length - 1}
            defaultExpanded={isStreaming}
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
              isStreaming &&
              index === message.parts.length - 1 &&
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
            isStreaming={isStreaming && index === message.parts.length - 1}
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

  const canShowActions = !isUser && !isStreaming && (onRevert || onFork);

  return (
    <View style={styles.container}>
      {/* Role/Agent label */}
      <View style={styles.labelRow}>
        <MaterialCommunityIcons
          name={isUser ? 'account' : getAgentIcon(message.agent || '')}
          size={14}
          color={isUser ? Colors.primary : Colors.textSecondary}
        />
        <Text style={[styles.roleLabel, isUser && styles.roleLabelUser]}>
          {isUser ? 'you' : (message.agent || 'assistant')}
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
        <View style={[styles.messageBox, isUser && styles.messageBoxUser]}>
          {hasContent ? (
            message.parts.map(renderPart)
          ) : isStreaming ? (
            <ThinkingIndicator label="Starting..." />
          ) : (
            <Text style={styles.emptyText}>(empty message)</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

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
  messageBoxUser: {
    borderColor: Colors.primary,
    borderLeftWidth: 3,
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
