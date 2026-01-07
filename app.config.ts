import { ExpoConfig, ConfigContext } from 'expo/config';

// Read version from package.json - single source of truth
const { version } = require('./package.json');

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: 'DroidCode',
  slug: 'droidcode-expo',
  version,
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'droidcode',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#1A1918',
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.droid.code',
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
      NSCameraUsageDescription: 'DroidCode uses the camera to capture images for AI analysis.',
      NSBonjourServices: ['_http._tcp.'],
      NSLocalNetworkUsageDescription: 'DroidCode uses local network access to discover OpenCode servers.',
    },
  },

  android: {
    package: 'com.droid.code',
    softwareKeyboardLayoutMode: 'pan',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#1A1918',
    },
    edgeToEdgeEnabled: true,
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.CHANGE_WIFI_MULTICAST_STATE',
      'android.permission.CAMERA',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
      'android.permission.REQUEST_INSTALL_PACKAGES',
      'android.permission.READ_MEDIA_IMAGES',
    ],
  },

  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    'expo-sqlite',
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: true,
        },
      },
    ],
    [
      'expo-notifications',
      {
        color: '#6366f1',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'DroidCode uses the camera to capture images for AI analysis.',
      },
    ],
    './plugins/withSseService',
  ],

  experiments: {
    typedRoutes: true,
  },

  // EAS Update configuration
  updates: {
    url: 'https://u.expo.dev/YOUR_PROJECT_ID',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },

  extra: {
    eas: {
      projectId: 'YOUR_PROJECT_ID',
    },
  },
});
