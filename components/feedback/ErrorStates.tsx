/**
 * Error state components for various UI contexts.
 * Provides consistent error handling and display throughout the app.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';

import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/Theme';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  type?: 'error' | 'warning' | 'info';
  dismissable?: boolean;
}

/**
 * Error banner that appears at the top of the screen.
 */
export function ErrorBanner({
  message,
  onDismiss,
  onRetry,
  type = 'error',
  dismissable = true,
}: ErrorBannerProps) {
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 15, stiffness: 200 });
    opacity.value = withTiming(1, { duration: 200 });
  }, [translateY, opacity]);

  const handleDismiss = () => {
    translateY.value = withTiming(-100, { duration: 200 });
    opacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => onDismiss?.(), 200);
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const colors = getTypeColors(type);

  return (
    <Animated.View
      style={[styles.banner, { backgroundColor: colors.background }, containerStyle]}
    >
      <MaterialCommunityIcons
        name={colors.icon}
        size={20}
        color={colors.color}
      />
      <Text style={[styles.bannerText, { color: colors.color }]} numberOfLines={2}>
        {message}
      </Text>
      {onRetry && (
        <Pressable style={styles.bannerButton} onPress={onRetry}>
          <Text style={[styles.bannerButtonText, { color: colors.color }]}>
            Retry
          </Text>
        </Pressable>
      )}
      {dismissable && (
        <Pressable onPress={handleDismiss} hitSlop={8}>
          <MaterialCommunityIcons
            name="close"
            size={20}
            color={colors.color}
          />
        </Pressable>
      )}
    </Animated.View>
  );
}

interface ErrorCardProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}

/**
 * Error card for displaying errors in content areas.
 */
export function ErrorCard({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try Again',
  icon = 'alert-circle-outline',
}: ErrorCardProps) {
  const scale = useSharedValue(0.95);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
    opacity.value = withTiming(1, { duration: 300 });
  }, [scale, opacity]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.card, cardStyle]}>
      <View style={styles.cardIcon}>
        <MaterialCommunityIcons
          name={icon}
          size={48}
          color={Colors.error}
        />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardMessage}>{message}</Text>
      {onRetry && (
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <MaterialCommunityIcons
            name="refresh"
            size={18}
            color={Colors.text}
          />
          <Text style={styles.retryButtonText}>{retryLabel}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

/**
 * Full screen error state.
 */
export function ErrorScreen({
  title = 'Oops!',
  message = 'Something went wrong. Please try again.',
  onRetry,
  onGoBack,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onGoBack?: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.screenContent}>
        <View style={styles.screenIcon}>
          <MaterialCommunityIcons
            name="alert-circle"
            size={72}
            color={Colors.error}
          />
        </View>
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenMessage}>{message}</Text>
        <View style={styles.screenButtons}>
          {onGoBack && (
            <Pressable
              style={[styles.screenButton, styles.screenButtonSecondary]}
              onPress={onGoBack}
            >
              <MaterialCommunityIcons
                name="arrow-left"
                size={18}
                color={Colors.text}
              />
              <Text style={styles.screenButtonSecondaryText}>Go Back</Text>
            </Pressable>
          )}
          {onRetry && (
            <Pressable
              style={[styles.screenButton, styles.screenButtonPrimary]}
              onPress={onRetry}
            >
              <MaterialCommunityIcons
                name="refresh"
                size={18}
                color={Colors.text}
              />
              <Text style={styles.screenButtonPrimaryText}>Try Again</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * Connection error with retry.
 */
export function ConnectionError({
  onRetry,
  message = 'Unable to connect to the server',
}: {
  onRetry?: () => void;
  message?: string;
}) {
  const shake = useSharedValue(0);

  const handleRetry = () => {
    // Shake animation on retry
    shake.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
    onRetry?.();
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  return (
    <View style={styles.connectionError}>
      <Animated.View style={iconStyle}>
        <MaterialCommunityIcons
          name="wifi-off"
          size={48}
          color={Colors.error}
        />
      </Animated.View>
      <Text style={styles.connectionTitle}>Connection Error</Text>
      <Text style={styles.connectionMessage}>{message}</Text>
      {onRetry && (
        <Pressable style={styles.connectionRetry} onPress={handleRetry}>
          <MaterialCommunityIcons
            name="refresh"
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.connectionRetryText}>Retry Connection</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Inline error message.
 */
export function InlineError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <View style={styles.inline}>
      <MaterialCommunityIcons
        name="alert-circle"
        size={14}
        color={Colors.error}
      />
      <Text style={styles.inlineText}>{message}</Text>
      {onDismiss && (
        <Pressable onPress={onDismiss} hitSlop={8}>
          <MaterialCommunityIcons
            name="close"
            size={14}
            color={Colors.textMuted}
          />
        </Pressable>
      )}
    </View>
  );
}

/**
 * Empty state component.
 */
export function EmptyState({
  icon = 'inbox-outline',
  title = 'Nothing here yet',
  message,
  action,
  actionLabel = 'Get Started',
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title?: string;
  message?: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons
          name={icon}
          size={64}
          color={Colors.textMuted}
        />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message && <Text style={styles.emptyMessage}>{message}</Text>}
      {action && (
        <Pressable style={styles.emptyAction} onPress={action}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function getTypeColors(type: 'error' | 'warning' | 'info') {
  switch (type) {
    case 'error':
      return {
        color: Colors.error,
        background: Colors.diffRemovedBackground,
        icon: 'alert-circle' as const,
      };
    case 'warning':
      return {
        color: Colors.warning,
        background: 'rgba(255, 214, 10, 0.15)',
        icon: 'alert' as const,
      };
    case 'info':
      return {
        color: Colors.info,
        background: 'rgba(100, 210, 255, 0.15)',
        icon: 'information' as const,
      };
  }
}

const styles = StyleSheet.create({
  // Banner styles
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  bannerText: {
    flex: 1,
    fontSize: FontSize.sm,
  },
  bannerButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  bannerButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  // Card styles
  card: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    margin: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  cardIcon: {
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  cardMessage: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  // Screen styles
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  screenContent: {
    alignItems: 'center',
    maxWidth: 300,
  },
  screenIcon: {
    marginBottom: Spacing.lg,
  },
  screenTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  screenMessage: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  screenButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  screenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  screenButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  screenButtonSecondary: {
    backgroundColor: Colors.backgroundTertiary,
  },
  screenButtonPrimaryText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  screenButtonSecondaryText: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.text,
  },
  // Connection error styles
  connectionError: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  connectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  connectionMessage: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  connectionRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  connectionRetryText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.primary,
  },
  // Inline styles
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    backgroundColor: Colors.diffRemovedBackground,
    borderRadius: BorderRadius.sm,
    marginVertical: Spacing.xs,
  },
  inlineText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.error,
  },
  // Empty state styles
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    paddingTop: Spacing.xxxl,
  },
  emptyIcon: {
    marginBottom: Spacing.md,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  emptyMessage: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  emptyAction: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  emptyActionText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
});
