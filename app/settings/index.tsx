/**
 * Settings screen matching the Kotlin DroidCode app.
 * Features: Updates, Debug Logs.
 */

import { useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { Text, View, useThemeColor } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useSettingsStore } from '@/stores/settingsStore';
import { debugLogManager } from '@/services/debug/debugLogManager';
import { Colors } from '@/constants/Theme';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();

  const {
    currentVersionName,
    isCheckingForUpdate,
    isDownloadingUpdate,
    downloadProgress,
    updateAvailable,
    cachedApkPath,
    debugLogs,
    error,
    initialize,
    checkForUpdate,
    installUpdate,
    clearLogs,
    dismissError,
  } = useSettingsStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: dismissError }]);
    }
  }, [error, dismissError]);

  const handleCopyLogs = useCallback(async () => {
    const logText = debugLogs
      .map((log) => `[${log.timestamp}] ${log.tag}: ${log.message}`)
      .join('\n');
    await Clipboard.setStringAsync(logText);
    Alert.alert('Copied', 'Logs copied to clipboard');
  }, [debugLogs]);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = Colors.border;
  const cardBackground = Colors.backgroundSecondary;
  const mutedColor = Colors.textMuted;
  const tertiaryColor = Colors.purple;
  const secondaryColor = Colors.textMuted;

  const getUpdateStatus = () => {
    if (isDownloadingUpdate) {
      return `downloading ${Math.round(downloadProgress * 100)}%`;
    }
    if (isCheckingForUpdate) {
      return 'checking...';
    }
    if (cachedApkPath && updateAvailable) {
      return `v${updateAvailable.versionName} ready`;
    }
    if (updateAvailable) {
      return `v${updateAvailable.versionName} available`;
    }
    return 'up to date';
  };

  const isUpToDate = !updateAvailable && !isCheckingForUpdate && !isDownloadingUpdate;

  return (
    <ScrollView style={[styles.container, { backgroundColor }]}>
      {/* Updates Section */}
      <Text style={[styles.sectionTitle, { color: tertiaryColor }]}>[updates]</Text>

      <View style={[styles.statusCard, { backgroundColor: cardBackground, borderColor }]}>
        <View style={styles.statusRow}>
          <Text style={[styles.statusLabel, { color: mutedColor }]}>status</Text>
          <Text
            style={[
              styles.statusValue,
              {
                color: isUpToDate
                  ? Colors.success
                  : isCheckingForUpdate || isDownloadingUpdate
                  ? Colors.warning
                  : Colors.info,
              },
            ]}
          >
            {getUpdateStatus()}
          </Text>
        </View>

        {cachedApkPath && updateAvailable ? (
          <Pressable
            style={[styles.button, styles.primaryButton]}
            onPress={installUpdate}
          >
            <Text style={styles.primaryButtonText}>install</Text>
          </Pressable>
        ) : !isDownloadingUpdate ? (
          <Pressable
            style={[styles.button, styles.secondaryButton, { borderColor }]}
            onPress={checkForUpdate}
            disabled={isCheckingForUpdate}
          >
            <Text style={[styles.secondaryButtonText, { color: Colors.info }]}>check</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Download Progress */}
      {isDownloadingUpdate && (
        <View style={[styles.progressBar, { backgroundColor: cardBackground }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${downloadProgress * 100}%`, backgroundColor: Colors.info },
            ]}
          />
        </View>
      )}

      {/* Release Notes */}
      {updateAvailable?.releaseNotes && (
        <>
          <Text style={[styles.label, { color: secondaryColor }]}>[release notes]</Text>
          <Text style={[styles.releaseNotes, { color: mutedColor }]}>
            {updateAvailable.releaseNotes}
          </Text>
        </>
      )}

      <View style={[styles.divider, { backgroundColor: borderColor }]} />

      {/* Debug Logs Section */}
      <View style={styles.logsHeader}>
        <Text style={[styles.sectionTitle, { color: tertiaryColor }]}>[logs]</Text>
        {debugLogs.length > 0 && (
          <View style={styles.logsActions}>
            <Pressable
              style={[styles.button, styles.outlineButton, { borderColor }]}
              onPress={handleCopyLogs}
            >
              <Text style={[styles.outlineButtonText, { color: textColor }]}>copy</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.outlineButton, { borderColor }]}
              onPress={clearLogs}
            >
              <Text style={[styles.outlineButtonText, { color: textColor }]}>clear</Text>
            </Pressable>
          </View>
        )}
      </View>

      {debugLogs.length === 0 ? (
        <Text style={[styles.helpText, { color: secondaryColor }]}>
          no logs yet. send a message to see API logs.
        </Text>
      ) : (
        <View style={[styles.logsContainer, { backgroundColor: cardBackground, borderColor }]}>
          <ScrollView style={styles.logsScroll} nestedScrollEnabled>
            {debugLogs.slice().reverse().map((log) => (
              <Text
                key={log.id}
                style={[
                  styles.logEntry,
                  { color: log.isError ? Colors.error : textColor },
                ]}
                numberOfLines={10}
              >
                [{log.timestamp}] {log.tag}: {log.message}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Version Footer */}
      <Text style={[styles.version, { color: secondaryColor }]}>
        v{currentVersionName}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 16,
    marginBottom: 8,
  },
  helpText: {
    fontSize: 13,
    marginBottom: 12,
  },
  statusCard: {
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  statusLabel: {
    fontSize: 12,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  primaryButton: {
    backgroundColor: Colors.info,
  },
  primaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  secondaryButton: {
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  outlineButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  outlineButtonText: {
    fontSize: 13,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  label: {
    fontSize: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  releaseNotes: {
    fontSize: 13,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  logsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  logsActions: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'transparent',
  },
  logsContainer: {
    borderWidth: 1,
    borderRadius: 4,
    height: 200,
    overflow: 'hidden',
  },
  logsScroll: {
    padding: 8,
  },
  logEntry: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 4,
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 24,
    marginBottom: 32,
  },
});
