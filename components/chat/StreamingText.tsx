/**
 * StreamingText component with animated cursor.
 * Shows text being streamed with a pulsing cursor at the end.
 */

import { useEffect, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import Markdown from 'react-native-markdown-display';

import { Colors, FontFamily, FontSize } from '@/constants/Theme';

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  style?: object;
}

export function StreamingText({ text, isStreaming, style }: StreamingTextProps) {
  const cursorOpacity = useSharedValue(1);

  useEffect(() => {
    if (isStreaming) {
      cursorOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 400 }),
          withTiming(1, { duration: 400 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(cursorOpacity);
      cursorOpacity.value = 0;
    }

    return () => {
      cancelAnimation(cursorOpacity);
    };
  }, [isStreaming, cursorOpacity]);

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  // Memoize markdown styles to avoid recreation on every render
  const mergedStyles = useMemo(() => ({ ...markdownStyles, ...style }), [style]);

  // Memoize the markdown content to prevent re-parsing when text hasn't changed
  const markdownContent = useMemo(() => (
    <Markdown style={mergedStyles}>
      {text || ''}
    </Markdown>
  ), [text, mergedStyles]);

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        {markdownContent}
      </View>
      {isStreaming && (
        <Animated.Text style={[styles.cursor, cursorStyle]}>|</Animated.Text>
      )}
    </View>
  );
}

/**
 * Standalone pulsing cursor component.
 * Use when you need just the cursor without markdown.
 */
export function PulsingCursor() {
  const cursorOpacity = useSharedValue(1);

  useEffect(() => {
    cursorOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 400 }),
        withTiming(1, { duration: 400 })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(cursorOpacity);
    };
  }, [cursorOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  return <Animated.Text style={[styles.cursor, animatedStyle]}>|</Animated.Text>;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  textContainer: {
    flex: 1,
  },
  cursor: {
    color: Colors.primary,
    fontSize: FontSize.lg,
    fontFamily: FontFamily.mono,
    fontWeight: '700',
    marginLeft: 1,
  },
});

/**
 * OpenCode-style markdown rendering.
 * All text uses uniform size (14px) with weight/color differentiation.
 * Matches OpenCode's terminal aesthetic: clean, minimal, monospaced.
 */
const markdownStyles = {
  // ===== BODY =====
  body: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FontFamily.mono,
  },

  // ===== PARAGRAPHS =====
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
    fontSize: 14,
    lineHeight: 22,
  },

  // ===== HEADINGS (ALL SAME SIZE - OpenCode style) =====
  heading1: {
    fontSize: 14,  // Same as body - differentiated by weight only
    lineHeight: 21,
    color: Colors.text,
    fontWeight: '700' as const,
    fontFamily: FontFamily.mono,
    marginTop: 16,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 14,  // Same as body
    lineHeight: 21,
    color: Colors.text,
    fontWeight: '700' as const,
    fontFamily: FontFamily.mono,
    marginTop: 16,
    marginBottom: 8,
  },
  heading3: {
    fontSize: 14,  // Same as body
    lineHeight: 21,
    color: Colors.text,
    fontWeight: '600' as const,
    fontFamily: FontFamily.mono,
    marginTop: 12,
    marginBottom: 6,
  },
  heading4: {
    fontSize: 14,  // Same as body
    lineHeight: 21,
    color: Colors.text,
    fontWeight: '600' as const,
    fontFamily: FontFamily.mono,
    marginTop: 12,
    marginBottom: 6,
  },
  heading5: {
    fontSize: 14,  // Same as body
    lineHeight: 21,
    color: Colors.text,
    fontWeight: '500' as const,
    fontFamily: FontFamily.mono,
    marginTop: 8,
    marginBottom: 4,
  },
  heading6: {
    fontSize: 14,  // Same as body
    lineHeight: 21,
    color: Colors.text,
    fontWeight: '500' as const,
    fontFamily: FontFamily.mono,
    marginTop: 8,
    marginBottom: 4,
  },

  // ===== EMPHASIS =====
  strong: {
    fontWeight: '700' as const,
    color: Colors.text,  // Same color, just bolder
  },
  em: {
    fontStyle: 'italic' as const,
    color: Colors.text,  // Same color, just italic
  },
  s: {
    textDecorationLine: 'line-through' as const,
    color: Colors.textMuted,
  },

  // ===== CODE =====
  code_inline: {
    // NO background - OpenCode style (just colored text)
    backgroundColor: 'transparent',
    color: Colors.cyan,
    fontFamily: FontFamily.mono,
    fontSize: 14,
    fontWeight: '500' as const,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
  },
  code_block: {
    backgroundColor: Colors.backgroundCode,
    color: Colors.text,
    fontFamily: FontFamily.mono,
    fontSize: 13,
    padding: 8,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: Colors.border,
    marginVertical: 8,
  },
  fence: {
    backgroundColor: Colors.backgroundCode,
    color: Colors.text,
    fontFamily: FontFamily.mono,
    fontSize: 13,
    padding: 8,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: Colors.border,
    marginVertical: 8,
    overflow: 'hidden' as const,
  },

  // ===== BLOCKQUOTES =====
  blockquote: {
    backgroundColor: 'transparent',  // No background - OpenCode style
    borderLeftWidth: 2,  // Left border only
    borderLeftColor: Colors.purple,
    borderColor: 'transparent',
    paddingLeft: 8,
    paddingRight: 0,
    paddingVertical: 0,
    marginVertical: 12,
    color: Colors.textMuted,  // Weaker text color
  },

  // ===== LISTS =====
  bullet_list: {
    marginVertical: 8,
    paddingLeft: 0,  // Minimal indent
  },
  ordered_list: {
    marginVertical: 8,
    paddingLeft: 0,  // Minimal indent
  },
  list_item: {
    marginVertical: 4,
    flexDirection: 'row' as const,
    fontSize: 14,
  },
  // List markers (bullets and numbers)
  bullet_list_icon: {
    color: Colors.textMuted,  // Muted bullet color
    fontSize: 14,
    marginRight: 8,
    width: 20,
  },
  ordered_list_icon: {
    color: Colors.textMuted,  // Muted number color
    fontSize: 14,
    marginRight: 8,
    width: 20,
  },
  bullet_list_content: {
    flex: 1,
    fontSize: 14,
  },
  ordered_list_content: {
    flex: 1,
    fontSize: 14,
  },

  // ===== LINKS =====
  link: {
    color: Colors.info,
    textDecorationLine: 'underline' as const,
    textDecorationColor: Colors.info,
  },
  blocklink: {
    color: Colors.info,
    textDecorationLine: 'underline' as const,
  },

  // ===== HORIZONTAL RULE =====
  hr: {
    backgroundColor: 'transparent',  // Invisible - OpenCode style (just spacing)
    height: 0,
    marginVertical: 20,
    borderWidth: 0,
  },

  // ===== TABLES =====
  table: {
    borderWidth: 0,  // No outer border
    marginVertical: 12,
  },
  thead: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tbody: {},
  th: {
    color: Colors.text,
    fontWeight: '600' as const,
    fontSize: 14,
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    textAlign: 'left' as const,
  },
  tr: {
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.borderLight,
  },
  td: {
    fontSize: 14,
    padding: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.borderLight,
    textAlign: 'left' as const,
  },

  // ===== IMAGES =====
  image: {
    width: '100%' as any,  // Type assertion for percentage width
    borderRadius: 4,
    marginVertical: 12,
  },

  // ===== MISC =====
  text: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: FontFamily.mono,
  },
  textgroup: {
    fontSize: 14,
  },
  hardbreak: {
    height: 14,
  },
  softbreak: {},
};
