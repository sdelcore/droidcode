/**
 * PathAutocomplete component for directory browsing.
 * Uses the OpenCode API to list directories on the remote host.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme';
import { apiClient } from '@/services/api/apiClient';
import type { FileNodeDto } from '@/types';

interface PathAutocompleteProps {
  hostId: number;
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function PathAutocomplete({
  hostId,
  value,
  onChange,
  placeholder = 'Enter directory path...',
  autoFocus = false,
}: PathAutocompleteProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FileNodeDto[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Debounced fetch of directory contents
  const fetchSuggestions = useCallback(async (path: string) => {
    if (!path) {
      setSuggestions([]);
      return;
    }

    // Determine parent directory to list
    const parentPath = path.endsWith('/') ? path : path.substring(0, path.lastIndexOf('/') + 1) || '/';

    try {
      setIsLoading(true);
      setError(null);
      const files = await apiClient.listFiles(hostId, parentPath);

      // Filter to only show directories
      const dirs = files.filter((f) => f.type === 'directory');

      // If there's text after the last slash, filter by prefix
      const prefix = path.substring(path.lastIndexOf('/') + 1).toLowerCase();
      const filtered = prefix
        ? dirs.filter((d) => d.name.toLowerCase().startsWith(prefix))
        : dirs;

      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } catch (err) {
      console.log('[PathAutocomplete] Error fetching:', err);
      setError(err instanceof Error ? err.message : 'Failed to list files');
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [hostId]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, fetchSuggestions]);

  const handleSelectSuggestion = (item: FileNodeDto) => {
    // Set path to the absolute path with trailing slash for navigation
    const newPath = item.absolute.endsWith('/') ? item.absolute : item.absolute + '/';
    onChange(newPath);
    // Keep focus and show new suggestions
    inputRef.current?.focus();
  };

  const handleNavigateUp = () => {
    if (value.length > 1) {
      // Remove trailing slash if present, then go up one level
      const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
      const parentPath = normalized.substring(0, normalized.lastIndexOf('/') + 1) || '/';
      onChange(parentPath);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <MaterialCommunityIcons
          name="folder-outline"
          size={20}
          color={Colors.textMuted}
          style={styles.inputIcon}
        />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          onFocus={() => setShowSuggestions(suggestions.length > 0)}
          onBlur={() => {
            // Delay hiding to allow tap on suggestions
            setTimeout(() => setShowSuggestions(false), 200);
          }}
        />
        {value.length > 1 && (
          <Pressable onPress={handleNavigateUp} style={styles.upButton}>
            <MaterialCommunityIcons name="arrow-up" size={18} color={Colors.textSecondary} />
          </Pressable>
        )}
        {isLoading && (
          <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
        )}
      </View>

      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.absolute}
            keyboardShouldPersistTaps="handled"
            style={styles.suggestionsList}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.suggestionItem,
                  pressed && styles.suggestionItemPressed,
                ]}
                onPress={() => handleSelectSuggestion(item)}
              >
                <MaterialCommunityIcons
                  name="folder"
                  size={18}
                  color={Colors.warning}
                />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputIcon: {
    marginLeft: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    fontFamily: FontFamily.mono,
    color: Colors.text,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  upButton: {
    padding: Spacing.sm,
    marginRight: Spacing.xs,
  },
  loader: {
    marginRight: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    marginTop: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  suggestionsContainer: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 200,
    overflow: 'hidden',
  },
  suggestionsList: {
    flexGrow: 0,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  suggestionItemPressed: {
    backgroundColor: Colors.backgroundTertiary,
  },
  suggestionText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
  },
});
