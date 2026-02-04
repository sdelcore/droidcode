/**
 * PermissionDialog component for handling tool permission requests.
 * Displays permission request details and action buttons.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize, FontFamily } from '@/constants/Theme';
import type { Permission, PermissionResponse } from '@/types';

interface PermissionDialogProps {
  permission: Permission | null;
  onRespond: (permissionId: string, response: PermissionResponse, message?: string) => void;
  onDismiss?: () => void;
}

export function PermissionDialog({
  permission,
  onRespond,
  onDismiss,
}: PermissionDialogProps) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (permission) {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 15, stiffness: 200 });
      translateY.value = withSpring(0, { damping: 15, stiffness: 200 });
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      scale.value = withTiming(0.9, { duration: 150 });
      translateY.value = withTiming(20, { duration: 150 });
    }
  }, [permission, opacity, scale, translateY]);

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

  if (!permission) {
    return null;
  }

  const handleRespond = (response: PermissionResponse) => {
    onRespond(permission.id, response);
  };

  const toolInfo = getToolInfo(permission.toolType);

  return (
    <Modal
      visible={!!permission}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        </Animated.View>

        <Animated.View style={[styles.dialog, dialogStyle]}>
          <View style={styles.header}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: toolInfo.bgColor },
              ]}
            >
              <MaterialCommunityIcons
                name={toolInfo.icon}
                size={24}
                color={toolInfo.color}
              />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Permission Required</Text>
              <Text style={styles.toolType}>{permission.toolType}</Text>
            </View>
          </View>

          <View style={styles.content}>
            <Text style={styles.description}>{permission.title}</Text>

            {permission.metadata && Object.keys(permission.metadata).length > 0 && (
              <View style={styles.metadataContainer}>
                <Text style={styles.metadataTitle}>Details</Text>
                <ScrollView
                  style={styles.metadataScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {Object.entries(permission.metadata).map(([key, value]) => (
                    <View key={key} style={styles.metadataRow}>
                      <Text style={styles.metadataKey}>{formatKey(key)}</Text>
                      <Text style={styles.metadataValue} selectable>
                        {formatValue(value)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.denyButton]}
              onPress={() => handleRespond('deny')}
            >
              <MaterialCommunityIcons
                name="close"
                size={18}
                color={Colors.error}
              />
              <Text style={[styles.buttonText, styles.denyText]}>Deny</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.acceptAlwaysButton]}
              onPress={() => handleRespond('accept_always')}
            >
              <MaterialCommunityIcons
                name="check-all"
                size={18}
                color={Colors.purple}
              />
              <Text style={[styles.buttonText, styles.acceptAlwaysText]}>
                Always
              </Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.acceptButton]}
              onPress={() => handleRespond('accept')}
            >
              <MaterialCommunityIcons
                name="check"
                size={18}
                color={Colors.text}
              />
              <Text style={[styles.buttonText, styles.acceptText]}>Allow</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>
            "Always" will remember this choice for similar requests
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Inline permission request banner.
 * Displays at the bottom of the chat with slide-in animation and haptic feedback.
 */
export function PermissionBanner({
  permission,
  onRespond,
}: {
  permission: Permission;
  onRespond: (permissionId: string, response: PermissionResponse, message?: string) => void;
}) {
  const toolInfo = getToolInfo(permission.toolType);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  // Trigger haptic feedback when banner appears
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleRespond = useCallback((response: PermissionResponse, message?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRespond(permission.id, response, message);
  }, [permission.id, onRespond]);

  const handleDenyPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowFeedbackInput(true);
  }, []);

  const handleDenySubmit = useCallback(() => {
    const message = feedbackText.trim() || undefined;
    handleRespond('deny', message);
    setShowFeedbackInput(false);
    setFeedbackText('');
  }, [feedbackText, handleRespond]);

  const handleDenyCancel = useCallback(() => {
    setShowFeedbackInput(false);
    setFeedbackText('');
  }, []);

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18).stiffness(140)}
      exiting={SlideOutDown.springify().damping(18).stiffness(140)}
      style={styles.banner}
    >
      {/* Header with icon and title */}
      <View style={styles.bannerHeader}>
        <View
          style={[
            styles.bannerIconContainer,
            { backgroundColor: toolInfo.bgColor },
          ]}
        >
          <MaterialCommunityIcons
            name={toolInfo.icon}
            size={18}
            color={toolInfo.color}
          />
        </View>
        <View style={styles.bannerContent}>
          <View style={styles.bannerTitleRow}>
            <Text style={styles.bannerLabel}>Permission Required</Text>
            <MaterialCommunityIcons
              name="shield-alert-outline"
              size={14}
              color={Colors.warning}
            />
          </View>
          <Text style={styles.bannerToolType}>{permission.toolType}</Text>
        </View>
      </View>

      {/* Permission description */}
      <Text style={styles.bannerDescription} numberOfLines={3}>
        {permission.title}
      </Text>

      {/* Feedback input (shown when denying) */}
      {showFeedbackInput ? (
        <View style={styles.feedbackContainer}>
          <Text style={styles.feedbackLabel}>Feedback (optional)</Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Tell the AI why you're denying..."
            placeholderTextColor={Colors.textMuted}
            value={feedbackText}
            onChangeText={setFeedbackText}
            multiline
            numberOfLines={2}
            autoFocus
          />
          <View style={styles.feedbackActions}>
            <Pressable
              style={({ pressed }) => [
                styles.feedbackButton,
                styles.feedbackCancelButton,
                pressed && styles.bannerButtonPressed,
              ]}
              onPress={handleDenyCancel}
            >
              <Text style={styles.feedbackCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.feedbackButton,
                styles.feedbackSubmitButton,
                pressed && styles.bannerButtonPressed,
              ]}
              onPress={handleDenySubmit}
            >
              <Text style={styles.feedbackSubmitText}>Deny</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* Action buttons */
        <View style={styles.bannerActions}>
          <Pressable
            style={({ pressed }) => [
              styles.bannerButton,
              styles.bannerDenyButton,
              pressed && styles.bannerButtonPressed,
            ]}
            onPress={handleDenyPress}
          >
            <MaterialCommunityIcons
              name="close"
              size={16}
              color={Colors.error}
            />
            <Text style={styles.bannerDenyText}>Deny</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.bannerButton,
              styles.bannerAlwaysButton,
              pressed && styles.bannerButtonPressed,
            ]}
            onPress={() => handleRespond('accept_always')}
          >
            <MaterialCommunityIcons
              name="check-all"
              size={16}
              color={Colors.purple}
            />
            <Text style={styles.bannerAlwaysText}>Always</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.bannerButton,
              styles.bannerAcceptButton,
              pressed && styles.bannerButtonPressed,
            ]}
            onPress={() => handleRespond('accept')}
          >
            <MaterialCommunityIcons
              name="check"
              size={16}
              color={Colors.text}
            />
            <Text style={styles.bannerAcceptText}>Allow</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

function getToolInfo(toolType: string): {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bgColor: string;
} {
  const type = toolType.toLowerCase();

  if (type.includes('bash') || type.includes('shell') || type.includes('command')) {
    return {
      icon: 'console',
      color: Colors.warning,
      bgColor: 'rgba(255, 214, 10, 0.15)',
    };
  }

  if (type.includes('write') || type.includes('edit')) {
    return {
      icon: 'pencil',
      color: Colors.orange,
      bgColor: 'rgba(255, 149, 0, 0.15)',
    };
  }

  if (type.includes('read') || type.includes('file')) {
    return {
      icon: 'file-document-outline',
      color: Colors.info,
      bgColor: 'rgba(100, 210, 255, 0.15)',
    };
  }

  if (type.includes('web') || type.includes('fetch') || type.includes('http')) {
    return {
      icon: 'web',
      color: Colors.primary,
      bgColor: 'rgba(0, 122, 255, 0.15)',
    };
  }

  if (type.includes('search') || type.includes('grep') || type.includes('glob')) {
    return {
      icon: 'magnify',
      color: Colors.purple,
      bgColor: 'rgba(167, 139, 250, 0.15)',
    };
  }

  if (type.includes('notebook')) {
    return {
      icon: 'notebook',
      color: Colors.orange,
      bgColor: 'rgba(255, 149, 0, 0.15)',
    };
  }

  return {
    icon: 'shield-alert',
    color: Colors.warning,
    bgColor: 'rgba(255, 214, 10, 0.15)',
  };
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value: string): string {
  // Truncate long values
  if (value.length > 500) {
    return value.substring(0, 497) + '...';
  }
  return value;
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
  toolType: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  content: {
    padding: Spacing.lg,
  },
  description: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 22,
  },
  metadataContainer: {
    marginTop: Spacing.md,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  metadataTitle: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  metadataScroll: {
    maxHeight: 150,
  },
  metadataRow: {
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  metadataKey: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  metadataValue: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
    color: Colors.text,
    lineHeight: 18,
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
  denyButton: {
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
  },
  acceptAlwaysButton: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
  },
  acceptButton: {
    backgroundColor: Colors.primary,
  },
  buttonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  denyText: {
    color: Colors.error,
  },
  acceptAlwaysText: {
    color: Colors.purple,
  },
  acceptText: {
    color: Colors.text,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  // Banner styles - OpenCode themed inline permission banner
  banner: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.warning,
    // Subtle glow effect with shadow
    ...Platform.select({
      ios: {
        shadowColor: Colors.warning,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  bannerHeader: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  bannerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  bannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  bannerLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bannerToolType: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 2,
  },
  bannerDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  bannerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  bannerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  bannerButtonPressed: {
    opacity: 0.7,
  },
  bannerDenyButton: {
    backgroundColor: `${Colors.error}20`,
  },
  bannerAlwaysButton: {
    backgroundColor: `${Colors.purple}20`,
  },
  bannerAcceptButton: {
    backgroundColor: Colors.primary,
  },
  bannerDenyText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.error,
  },
  bannerAlwaysText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.purple,
  },
  bannerAcceptText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textInverse,
  },
  // Feedback input styles (for denial)
  feedbackContainer: {
    marginTop: Spacing.xs,
  },
  feedbackLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  feedbackInput: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    paddingTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
    minHeight: 60,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  feedbackActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  feedbackButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  feedbackCancelButton: {
    backgroundColor: Colors.backgroundTertiary,
  },
  feedbackSubmitButton: {
    backgroundColor: `${Colors.error}20`,
  },
  feedbackCancelText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  feedbackSubmitText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.error,
  },
});
