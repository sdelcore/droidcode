/**
 * CreateProjectDialog - Modal for creating a new OpenCode project.
 * Allows user to specify name and browse for directory on remote host.
 */

import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';
import { PathAutocomplete } from '@/components/input/PathAutocomplete';

interface CreateProjectDialogProps {
  visible: boolean;
  hostId: number;
  onConfirm: (name: string, directory: string) => void;
  onDismiss: () => void;
  isLoading?: boolean;
}

export function CreateProjectDialog({
  visible,
  hostId,
  onConfirm,
  onDismiss,
  isLoading = false,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [directory, setDirectory] = useState('');
  const [error, setError] = useState<string | null>(null);

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 15, stiffness: 200 });
      translateY.value = withSpring(0, { damping: 15, stiffness: 200 });
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      scale.value = withTiming(0.9, { duration: 150 });
      translateY.value = withTiming(20, { duration: 150 });
      // Reset form when closing
      setName('');
      setDirectory('');
      setError(null);
    }
  }, [visible, opacity, scale, translateY]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const dialogStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
  }));

  // Auto-generate name from directory path
  useEffect(() => {
    if (!name && directory) {
      const normalized = directory.endsWith('/') ? directory.slice(0, -1) : directory;
      const dirName = normalized.split('/').pop() || '';
      if (dirName) {
        setName(dirName);
      }
    }
  }, [directory, name]);

  const handleConfirm = () => {
    if (!name.trim()) {
      setError('Please enter a project name');
      return;
    }
    if (!directory.trim()) {
      setError('Please select a directory');
      return;
    }

    setError(null);
    // Remove trailing slash for directory
    const normalizedDir = directory.endsWith('/') ? directory.slice(0, -1) : directory;
    onConfirm(name.trim(), normalizedDir);
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        </Animated.View>

        <Animated.View style={[styles.dialog, dialogStyle]}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="folder-plus"
                size={24}
                color={Colors.primary}
              />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>New Project</Text>
              <Text style={styles.subtitle}>Start an OpenCode server on a directory</Text>
            </View>
          </View>

          <View style={styles.content}>
            <View style={styles.field}>
              <Text style={styles.label}>Project Name</Text>
              <View style={styles.inputContainer}>
                <MaterialCommunityIcons
                  name="tag-outline"
                  size={20}
                  color={Colors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="My Project"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Directory</Text>
              <PathAutocomplete
                hostId={hostId}
                value={directory}
                onChange={setDirectory}
                placeholder="/home/user/projects/"
              />
            </View>

            {error && (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={16} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onDismiss}
              disabled={isLoading}
            >
              <Text style={[styles.buttonText, styles.cancelText]}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.confirmButton, isLoading && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
                <Text style={[styles.buttonText, styles.confirmText]}>Creating...</Text>
              ) : (
                <>
                  <MaterialCommunityIcons name="rocket-launch" size={18} color={Colors.text} />
                  <Text style={[styles.buttonText, styles.confirmText]}>Create</Text>
                </>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  field: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
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
    color: Colors.text,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderRadius: BorderRadius.md,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.error,
  },
  actions: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  cancelButton: {
    backgroundColor: Colors.backgroundTertiary,
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  cancelText: {
    color: Colors.textSecondary,
  },
  confirmText: {
    color: Colors.text,
  },
});
