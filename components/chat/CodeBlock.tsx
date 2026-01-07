/**
 * CodeBlock component with syntax highlighting.
 * Provides basic syntax highlighting for common languages.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { Colors, FontFamily, Spacing, BorderRadius } from '@/constants/Theme';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  maxHeight?: number;
  isStreaming?: boolean;
}

export const CodeBlock = React.memo(function CodeBlock({
  code,
  language,
  showLineNumbers = true,
  maxHeight = 400,
  isStreaming = false,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const lines = useMemo(() => code.split('\n'), [code]);
  const needsExpansion = lines.length > 20 && !expanded;

  const displayedCode = useMemo(() => {
    if (needsExpansion) {
      return lines.slice(0, 15).join('\n');
    }
    return code;
  }, [code, lines, needsExpansion]);

  const highlightedLines = useMemo(
    () => highlightCode(displayedCode, language || 'text'),
    [displayedCode, language]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.language}>{language || 'code'}</Text>
        <Pressable
          style={styles.copyButton}
          onPress={handleCopy}
          hitSlop={8}
        >
          <MaterialCommunityIcons
            name={copied ? 'check' : 'content-copy'}
            size={16}
            color={copied ? Colors.success : Colors.textMuted}
          />
        </Pressable>
      </View>

      <ScrollView
        style={[styles.codeContainer, { maxHeight }]}
        horizontal={false}
        showsVerticalScrollIndicator
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.codeContent}
        >
          {showLineNumbers && (
            <View style={styles.lineNumbers}>
              {highlightedLines.map((_, index) => (
                <Text key={index} style={styles.lineNumber}>
                  {index + 1}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.codeLines}>
            {highlightedLines.map((tokens, lineIndex) => (
              <View key={lineIndex} style={styles.codeLine}>
                {tokens.map((token, tokenIndex) => (
                  <Text
                    key={tokenIndex}
                    style={[styles.codeText, { color: token.color }]}
                  >
                    {token.text}
                  </Text>
                ))}
              </View>
            ))}
            {isStreaming && (
              <View style={styles.streamingIndicator}>
                <Text style={styles.streamingDot}>...</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ScrollView>

      {needsExpansion && (
        <Pressable
          style={styles.expandButton}
          onPress={() => setExpanded(true)}
        >
          <Text style={styles.expandText}>
            Show {lines.length - 15} more lines
          </Text>
          <MaterialCommunityIcons
            name="chevron-down"
            size={16}
            color={Colors.primary}
          />
        </Pressable>
      )}

      {expanded && lines.length > 20 && (
        <Pressable
          style={styles.expandButton}
          onPress={() => setExpanded(false)}
        >
          <Text style={styles.expandText}>Show less</Text>
          <MaterialCommunityIcons
            name="chevron-up"
            size={16}
            color={Colors.primary}
          />
        </Pressable>
      )}
    </View>
  );
});

interface Token {
  text: string;
  color: string;
}

/**
 * Basic syntax highlighting.
 * Returns an array of lines, each containing an array of tokens.
 */
function highlightCode(code: string, language: string): Token[][] {
  const lines = code.split('\n');

  return lines.map((line) => {
    const tokens: Token[] = [];

    switch (language.toLowerCase()) {
      case 'javascript':
      case 'js':
      case 'typescript':
      case 'ts':
      case 'jsx':
      case 'tsx':
        return highlightJavaScript(line);

      case 'python':
      case 'py':
        return highlightPython(line);

      case 'json':
        return highlightJSON(line);

      case 'bash':
      case 'sh':
      case 'shell':
      case 'zsh':
        return highlightBash(line);

      case 'css':
      case 'scss':
      case 'sass':
        return highlightCSS(line);

      case 'html':
      case 'xml':
        return highlightHTML(line);

      case 'go':
      case 'golang':
        return highlightGo(line);

      case 'rust':
      case 'rs':
        return highlightRust(line);

      case 'kotlin':
      case 'kt':
        return highlightKotlin(line);

      case 'swift':
        return highlightSwift(line);

      default:
        return [{ text: line, color: Colors.text }];
    }
  });
}

// JavaScript/TypeScript highlighting
function highlightJavaScript(line: string): Token[] {
  const tokens: Token[] = [];
  const keywords = /\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|default|async|await|try|catch|throw|new|this|super|typeof|instanceof|null|undefined|true|false)\b/g;
  const strings = /(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g;
  const comments = /\/\/.*$|\/\*[\s\S]*?\*\//g;
  const numbers = /\b\d+\.?\d*\b/g;
  const functions = /\b([a-zA-Z_]\w*)\s*(?=\()/g;

  let remaining = line;
  let match;

  // Process strings first
  while ((match = strings.exec(line)) !== null) {
    const before = line.substring(0, match.index);
    remaining = before + ' '.repeat(match[0].length) + line.substring(match.index + match[0].length);
  }

  // Simple tokenization
  let lastIndex = 0;
  const regex = /(\s+)|(\b(?:const|let|var|function|return|if|else|for|while|class|extends|import|export|from|default|async|await|try|catch|throw|new|this|super|typeof|instanceof|null|undefined|true|false)\b)|(["'`](?:[^"'`\\]|\\.)*?["'`])|(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\b\d+\.?\d*\b)|(\b[a-zA-Z_]\w*\s*(?=\())|([{}[\]().,;:=<>+\-*/%!&|^~?])/g;

  while ((match = regex.exec(line)) !== null) {
    // Add any text before this match
    if (match.index > lastIndex) {
      const text = line.substring(lastIndex, match.index);
      if (text) tokens.push({ text, color: Colors.text });
    }

    const [fullMatch, space, keyword, string, lineComment, blockComment, num, func, punct] = match;

    if (space) {
      tokens.push({ text: space, color: Colors.text });
    } else if (keyword) {
      tokens.push({ text: keyword, color: Colors.syntaxKeyword });
    } else if (string) {
      tokens.push({ text: string, color: Colors.syntaxString });
    } else if (lineComment || blockComment) {
      tokens.push({ text: lineComment || blockComment, color: Colors.syntaxComment });
    } else if (num) {
      tokens.push({ text: num, color: Colors.syntaxNumber });
    } else if (func) {
      // Extract just the function name
      const funcName = func.trim();
      tokens.push({ text: funcName, color: Colors.syntaxFunction });
    } else if (punct) {
      tokens.push({ text: punct, color: Colors.syntaxPunctuation });
    } else {
      tokens.push({ text: fullMatch, color: Colors.text });
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

// Python highlighting
function highlightPython(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\s+)|(\b(?:def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|lambda|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|async|await)\b)|(["']{3}[\s\S]*?["']{3}|["'](?:[^"'\\]|\\.)*?["'])|(#.*$)|(\b\d+\.?\d*\b)|(\b[a-zA-Z_]\w*\s*(?=\())|([{}[\]().,;:=<>+\-*/%@!&|^~])/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.substring(lastIndex, match.index), color: Colors.text });
    }

    const [fullMatch, space, keyword, string, comment, num, func, punct] = match;

    if (space) tokens.push({ text: space, color: Colors.text });
    else if (keyword) tokens.push({ text: keyword, color: Colors.syntaxKeyword });
    else if (string) tokens.push({ text: string, color: Colors.syntaxString });
    else if (comment) tokens.push({ text: comment, color: Colors.syntaxComment });
    else if (num) tokens.push({ text: num, color: Colors.syntaxNumber });
    else if (func) tokens.push({ text: func.trim(), color: Colors.syntaxFunction });
    else if (punct) tokens.push({ text: punct, color: Colors.syntaxPunctuation });
    else tokens.push({ text: fullMatch, color: Colors.text });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

// JSON highlighting
function highlightJSON(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\s+)|("(?:[^"\\]|\\.)*")\s*(:?)|(true|false|null)|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|([{}\[\],:])]/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.substring(lastIndex, match.index), color: Colors.text });
    }

    const [fullMatch, space, stringWithColon, colon, bool, num, punct] = match;

    if (space) {
      tokens.push({ text: space, color: Colors.text });
    } else if (stringWithColon) {
      if (colon) {
        // It's a key
        tokens.push({ text: stringWithColon, color: Colors.syntaxVariable });
        tokens.push({ text: colon, color: Colors.syntaxPunctuation });
      } else {
        // It's a value
        tokens.push({ text: stringWithColon, color: Colors.syntaxString });
      }
    } else if (bool) {
      tokens.push({ text: bool, color: Colors.syntaxKeyword });
    } else if (num) {
      tokens.push({ text: num, color: Colors.syntaxNumber });
    } else if (punct) {
      tokens.push({ text: punct, color: Colors.syntaxPunctuation });
    } else {
      tokens.push({ text: fullMatch, color: Colors.text });
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

// Bash highlighting
function highlightBash(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\s+)|(\b(?:if|then|else|elif|fi|case|esac|for|while|until|do|done|in|function|return|exit|export|source|alias|cd|ls|pwd|echo|cat|grep|awk|sed|rm|cp|mv|mkdir|touch|chmod|chown|sudo|apt|yum|npm|yarn|pip|git|docker|kubectl)\b)|(["'](?:[^"'\\]|\\.)*?["'])|(\$\{?[a-zA-Z_]\w*\}?)|(#.*$)|([|&;<>()$`\\])/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.substring(lastIndex, match.index), color: Colors.text });
    }

    const [fullMatch, space, keyword, string, variable, comment, special] = match;

    if (space) tokens.push({ text: space, color: Colors.text });
    else if (keyword) tokens.push({ text: keyword, color: Colors.syntaxKeyword });
    else if (string) tokens.push({ text: string, color: Colors.syntaxString });
    else if (variable) tokens.push({ text: variable, color: Colors.syntaxVariable });
    else if (comment) tokens.push({ text: comment, color: Colors.syntaxComment });
    else if (special) tokens.push({ text: special, color: Colors.syntaxOperator });
    else tokens.push({ text: fullMatch, color: Colors.text });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

// CSS highlighting
function highlightCSS(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\s+)|(#[a-fA-F0-9]{3,8})|(\b(?:important|inherit|initial|unset|none|auto|solid|dashed|dotted|hidden|visible|block|inline|flex|grid|absolute|relative|fixed|sticky)\b)|([.#]?[a-zA-Z_][\w-]*(?=\s*\{))|(@[a-zA-Z]+)|(-?\d+\.?\d*(?:px|em|rem|%|vh|vw|deg|s|ms)?)|([{}:;,>+~*])|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\/\*[\s\S]*?\*\/)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.substring(lastIndex, match.index), color: Colors.text });
    }

    const [fullMatch, space, color, keyword, selector, atRule, num, punct, string, comment] = match;

    if (space) tokens.push({ text: space, color: Colors.text });
    else if (color) tokens.push({ text: color, color: Colors.syntaxNumber });
    else if (keyword) tokens.push({ text: keyword, color: Colors.syntaxKeyword });
    else if (selector) tokens.push({ text: selector, color: Colors.syntaxFunction });
    else if (atRule) tokens.push({ text: atRule, color: Colors.purple });
    else if (num) tokens.push({ text: num, color: Colors.syntaxNumber });
    else if (punct) tokens.push({ text: punct, color: Colors.syntaxPunctuation });
    else if (string) tokens.push({ text: string, color: Colors.syntaxString });
    else if (comment) tokens.push({ text: comment, color: Colors.syntaxComment });
    else tokens.push({ text: fullMatch, color: Colors.text });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

// HTML highlighting
function highlightHTML(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\s+)|(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][\w-]*)|(\s[a-zA-Z][\w-]*(?==))|(=)|(["'](?:[^"'\\]|\\.)*?["'])|(\/?[>])|(&[a-zA-Z]+;|&#\d+;)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.substring(lastIndex, match.index), color: Colors.text });
    }

    const [fullMatch, space, comment, tag, attr, eq, string, bracket, entity] = match;

    if (space) tokens.push({ text: space, color: Colors.text });
    else if (comment) tokens.push({ text: comment, color: Colors.syntaxComment });
    else if (tag) tokens.push({ text: tag, color: Colors.syntaxKeyword });
    else if (attr) tokens.push({ text: attr, color: Colors.syntaxVariable });
    else if (eq) tokens.push({ text: eq, color: Colors.syntaxPunctuation });
    else if (string) tokens.push({ text: string, color: Colors.syntaxString });
    else if (bracket) tokens.push({ text: bracket, color: Colors.syntaxKeyword });
    else if (entity) tokens.push({ text: entity, color: Colors.syntaxNumber });
    else tokens.push({ text: fullMatch, color: Colors.text });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

// Go highlighting
function highlightGo(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\s+)|(\b(?:func|package|import|var|const|type|struct|interface|map|chan|go|defer|return|if|else|for|range|switch|case|default|select|break|continue|fallthrough|goto|nil|true|false|iota|make|new|append|len|cap|copy|delete|panic|recover)\b)|(["'`](?:[^"'`\\]|\\.)*?["'`])|(\/\/.*$|\/\*[\s\S]*?\*\/)|(\b\d+\.?\d*\b)|(\b[a-zA-Z_]\w*\s*(?=\())|([{}[\]().,;:=<>+\-*/%!&|^])/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.substring(lastIndex, match.index), color: Colors.text });
    }

    const [fullMatch, space, keyword, string, comment, num, func, punct] = match;

    if (space) tokens.push({ text: space, color: Colors.text });
    else if (keyword) tokens.push({ text: keyword, color: Colors.syntaxKeyword });
    else if (string) tokens.push({ text: string, color: Colors.syntaxString });
    else if (comment) tokens.push({ text: comment, color: Colors.syntaxComment });
    else if (num) tokens.push({ text: num, color: Colors.syntaxNumber });
    else if (func) tokens.push({ text: func.trim(), color: Colors.syntaxFunction });
    else if (punct) tokens.push({ text: punct, color: Colors.syntaxPunctuation });
    else tokens.push({ text: fullMatch, color: Colors.text });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

// Rust highlighting
function highlightRust(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\s+)|(\b(?:fn|let|mut|const|static|pub|mod|use|crate|self|super|impl|trait|struct|enum|type|where|if|else|match|for|while|loop|return|break|continue|move|ref|as|in|unsafe|async|await|dyn|true|false|Some|None|Ok|Err|Self)\b)|(["'](?:[^"'\\]|\\.)*?["'])|(\/\/.*$|\/\*[\s\S]*?\*\/)|(\b\d+\.?\d*(?:_\d+)*(?:u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize|f32|f64)?\b)|(\b[a-zA-Z_]\w*\s*(?=\())|([{}[\]().,;:=<>+\-*/%!&|^?])|(\b(?:i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char|str|String|Vec|Option|Result|Box)\b)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.substring(lastIndex, match.index), color: Colors.text });
    }

    const [fullMatch, space, keyword, string, comment, num, func, punct, builtinType] = match;

    if (space) tokens.push({ text: space, color: Colors.text });
    else if (keyword) tokens.push({ text: keyword, color: Colors.syntaxKeyword });
    else if (string) tokens.push({ text: string, color: Colors.syntaxString });
    else if (comment) tokens.push({ text: comment, color: Colors.syntaxComment });
    else if (num) tokens.push({ text: num, color: Colors.syntaxNumber });
    else if (func) tokens.push({ text: func.trim(), color: Colors.syntaxFunction });
    else if (punct) tokens.push({ text: punct, color: Colors.syntaxPunctuation });
    else if (builtinType) tokens.push({ text: builtinType, color: Colors.syntaxType });
    else tokens.push({ text: fullMatch, color: Colors.text });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

// Kotlin highlighting
function highlightKotlin(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\s+)|(\b(?:fun|val|var|class|object|interface|data|sealed|enum|companion|init|constructor|if|else|when|for|while|do|return|break|continue|throw|try|catch|finally|import|package|as|is|in|out|by|where|suspend|inline|crossinline|noinline|reified|annotation|open|final|abstract|override|private|protected|public|internal|lateinit|lazy|null|true|false|this|super|it)\b)|("""[\s\S]*?"""|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\/\/.*$|\/\*[\s\S]*?\*\/)|(\b\d+\.?\d*[fFL]?\b)|(\b[a-zA-Z_]\w*\s*(?=\())|([{}[\]().,;:=<>+\-*/%!&|^?@])|(\b(?:Int|Long|Short|Byte|Float|Double|Boolean|Char|String|Any|Unit|Nothing|List|Map|Set|Array)\b)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.substring(lastIndex, match.index), color: Colors.text });
    }

    const [fullMatch, space, keyword, string, comment, num, func, punct, builtinType] = match;

    if (space) tokens.push({ text: space, color: Colors.text });
    else if (keyword) tokens.push({ text: keyword, color: Colors.syntaxKeyword });
    else if (string) tokens.push({ text: string, color: Colors.syntaxString });
    else if (comment) tokens.push({ text: comment, color: Colors.syntaxComment });
    else if (num) tokens.push({ text: num, color: Colors.syntaxNumber });
    else if (func) tokens.push({ text: func.trim(), color: Colors.syntaxFunction });
    else if (punct) tokens.push({ text: punct, color: Colors.syntaxPunctuation });
    else if (builtinType) tokens.push({ text: builtinType, color: Colors.syntaxType });
    else tokens.push({ text: fullMatch, color: Colors.text });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

// Swift highlighting
function highlightSwift(line: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\s+)|(\b(?:func|var|let|class|struct|enum|protocol|extension|init|deinit|if|else|guard|switch|case|default|for|while|repeat|return|break|continue|throw|throws|rethrows|try|catch|do|import|as|is|in|inout|where|async|await|actor|nonisolated|private|fileprivate|internal|public|open|static|override|final|lazy|weak|unowned|optional|required|convenience|mutating|nonmutating|nil|true|false|self|Self|super|some|any)\b)|("""[\s\S]*?"""|"(?:[^"\\]|\\.)*")|(\/\/.*$|\/\*[\s\S]*?\*\/)|(\b\d+\.?\d*\b)|(\b[a-zA-Z_]\w*\s*(?=\())|([{}[\]().,;:=<>+\-*/%!&|^?@])|(\b(?:Int|Int8|Int16|Int32|Int64|UInt|UInt8|UInt16|UInt32|UInt64|Float|Double|Bool|String|Character|Array|Dictionary|Set|Optional|Any|AnyObject|Void|Never)\b)/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.substring(lastIndex, match.index), color: Colors.text });
    }

    const [fullMatch, space, keyword, string, comment, num, func, punct, builtinType] = match;

    if (space) tokens.push({ text: space, color: Colors.text });
    else if (keyword) tokens.push({ text: keyword, color: Colors.syntaxKeyword });
    else if (string) tokens.push({ text: string, color: Colors.syntaxString });
    else if (comment) tokens.push({ text: comment, color: Colors.syntaxComment });
    else if (num) tokens.push({ text: num, color: Colors.syntaxNumber });
    else if (func) tokens.push({ text: func.trim(), color: Colors.syntaxFunction });
    else if (punct) tokens.push({ text: punct, color: Colors.syntaxPunctuation });
    else if (builtinType) tokens.push({ text: builtinType, color: Colors.syntaxType });
    else tokens.push({ text: fullMatch, color: Colors.text });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.substring(lastIndex), color: Colors.text });
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: Colors.text }];
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundCode,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.backgroundTertiary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  language: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: FontFamily.mono,
    textTransform: 'lowercase',
  },
  copyButton: {
    padding: Spacing.xs,
  },
  codeContainer: {
    padding: Spacing.md,
  },
  codeContent: {
    flexDirection: 'row',
  },
  lineNumbers: {
    marginRight: Spacing.md,
    paddingRight: Spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  lineNumber: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: FontFamily.mono,
    lineHeight: 20,
    textAlign: 'right',
    minWidth: 24,
  },
  codeLines: {
    flex: 1,
  },
  codeLine: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    minHeight: 20,
  },
  codeText: {
    fontSize: 13,
    fontFamily: FontFamily.mono,
    lineHeight: 20,
  },
  streamingIndicator: {
    flexDirection: 'row',
  },
  streamingDot: {
    color: Colors.textMuted,
    fontFamily: FontFamily.mono,
    fontSize: 13,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: Spacing.xs,
  },
  expandText: {
    fontSize: 13,
    color: Colors.primary,
  },
});
