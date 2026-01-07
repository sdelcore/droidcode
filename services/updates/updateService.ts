/**
 * Update service for checking and installing app updates.
 */

import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  sha256: string;
  releaseNotes: string;
  platform?: string;
  minSdkVersion?: number;
}

const UPDATE_MANIFEST_URL = 'http://droidcode.aria.tap/manifest.json';

class UpdateService {
  private cachedUpdateInfo: UpdateInfo | null = null;
  private cachedApkPath: string | null = null;
  private updatesDir: string;

  constructor() {
    this.updatesDir = `${LegacyFileSystem.cacheDirectory}updates/`;
  }

  /**
   * Get the current app version name.
   */
  getCurrentVersionName(): string {
    return Constants.expoConfig?.version ?? '1.0.0';
  }

  /**
   * Get the current app version code (Android versionCode).
   * Calculated from version string: 200 + major*10000 + minor*100 + patch
   * e.g., 2.3.0 -> 20500
   */
  getCurrentVersionCode(): number {
    const version = this.getCurrentVersionName();
    const parts = version.split('.');
    const major = parseInt(parts[0]) || 0;
    const minor = parseInt(parts[1]) || 0;
    const patch = parseInt(parts[2]) || 0;
    return 200 + major * 10000 + minor * 100 + patch;
  }

  /**
   * Check for available updates.
   */
  async checkForUpdate(): Promise<UpdateInfo | null> {
    try {
      const response = await fetch(UPDATE_MANIFEST_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const manifest: UpdateInfo = await response.json();
      const currentVersionCode = this.getCurrentVersionCode();
      const currentVersionName = this.getCurrentVersionName();

      console.log(`[UpdateService] Current: ${currentVersionName} (${currentVersionCode}), Server: ${manifest.versionName} (${manifest.versionCode})`);

      // Only return update if version is higher
      if (manifest.versionCode > currentVersionCode) {
        console.log('[UpdateService] Update available');
        this.cachedUpdateInfo = manifest;
        return manifest;
      }

      console.log('[UpdateService] Already up to date');
      this.cachedUpdateInfo = null;
      return null;
    } catch (error) {
      console.error('[UpdateService] Failed to check for updates:', error);
      throw error;
    }
  }

  /**
   * Download the APK update with progress callback.
   */
  async downloadUpdate(
    updateInfo: UpdateInfo,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    if (Platform.OS !== 'android') {
      throw new Error('APK installation is only supported on Android');
    }

    // Ensure cache directory exists
    const dirInfo = await LegacyFileSystem.getInfoAsync(this.updatesDir);
    if (!dirInfo.exists) {
      await LegacyFileSystem.makeDirectoryAsync(this.updatesDir, { intermediates: true });
    }

    const apkPath = `${this.updatesDir}droidcode-${updateInfo.versionName}.apk`;

    // Check if already downloaded
    const fileInfo = await LegacyFileSystem.getInfoAsync(apkPath);
    if (fileInfo.exists) {
      this.cachedApkPath = apkPath;
      onProgress?.(1);
      return apkPath;
    }

    // Download with progress
    const downloadResumable = LegacyFileSystem.createDownloadResumable(
      updateInfo.downloadUrl,
      apkPath,
      {},
      (downloadProgress) => {
        if (downloadProgress.totalBytesExpectedToWrite > 0) {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          onProgress?.(progress);
        }
      }
    );

    try {
      const result = await downloadResumable.downloadAsync();
      if (!result || !result.uri) {
        throw new Error('Download failed: No result returned');
      }

      this.cachedApkPath = result.uri;
      onProgress?.(1);
      return result.uri;
    } catch (error) {
      console.error('[UpdateService] Download failed:', error);
      // Clean up partial download
      try {
        const fileInfo = await LegacyFileSystem.getInfoAsync(apkPath);
        if (fileInfo.exists) {
          await LegacyFileSystem.deleteAsync(apkPath, { idempotent: true });
        }
      } catch {}
      throw error;
    }
  }

  /**
   * Install the downloaded APK (Android only).
   * Uses FileProvider to create a content:// URI that can be shared with the package installer.
   */
  async installUpdate(apkPath?: string): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('APK installation is only supported on Android');
    }

    const path = apkPath || this.cachedApkPath;
    if (!path) {
      throw new Error('No APK file to install');
    }

    try {
      // Convert file:// URI to content:// URI via FileProvider
      // This is required since Android 7.0 (API 24) for sharing files with other apps
      const contentUri = await LegacyFileSystem.getContentUriAsync(path);

      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'application/vnd.android.package-archive',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
    } catch (error) {
      console.error('[UpdateService] Failed to launch install intent:', error);
      throw error;
    }
  }

  /**
   * Get cached APK path if available.
   */
  getCachedApkPath(): string | null {
    return this.cachedApkPath;
  }

  /**
   * Get cached update info if available.
   */
  getCachedUpdateInfo(): UpdateInfo | null {
    return this.cachedUpdateInfo;
  }

  /**
   * Clear cached APK files.
   */
  async clearCache(): Promise<void> {
    try {
      const dirInfo = await LegacyFileSystem.getInfoAsync(this.updatesDir);
      if (dirInfo.exists) {
        await LegacyFileSystem.deleteAsync(this.updatesDir, { idempotent: true });
      }
      this.cachedApkPath = null;
    } catch (error) {
      console.error('[UpdateService] Failed to clear cache:', error);
    }
  }
}

export const updateService = new UpdateService();
