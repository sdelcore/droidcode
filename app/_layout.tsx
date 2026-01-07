import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider, Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';

import { Colors, FontFamily } from '@/constants/Theme';
import {
  DatabaseProvider,
  AppLifecycleProvider,
  NotificationProvider,
} from '@/providers';

// Custom OpenCode theme with monospace fonts
const OpenCodeTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.backgroundSecondary,
    text: Colors.text,
    border: Colors.border,
    notification: Colors.info,
  },
  fonts: {
    regular: { fontFamily: FontFamily.mono, fontWeight: '400' },
    medium: { fontFamily: FontFamily.mono, fontWeight: '500' },
    bold: { fontFamily: FontFamily.mono, fontWeight: '700' },
    heavy: { fontFamily: FontFamily.mono, fontWeight: '900' },
  },
};

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <DatabaseProvider>
          <AppLifecycleProvider>
            <NotificationProvider>
              <ThemeProvider value={OpenCodeTheme}>
                <Stack>
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="hosts/index"
                    options={{
                      title: 'Servers',
                      headerLargeTitle: true,
                    }}
                  />
                  <Stack.Screen
                    name="hosts/add"
                    options={{
                      presentation: 'modal',
                      title: 'Add Server',
                    }}
                  />
                  <Stack.Screen
                    name="projects/[hostId]/index"
                    options={{
                      title: 'Projects',
                    }}
                  />
                  <Stack.Screen
                    name="sessions/[hostId]/[projectId]/index"
                    options={{
                      title: 'Sessions',
                    }}
                  />
                  <Stack.Screen
                    name="sessions/[hostId]/[projectId]/[sessionId]/index"
                    options={{
                      title: 'Chat',
                      headerBackTitle: 'Sessions',
                    }}
                  />
                  <Stack.Screen
                    name="settings/index"
                    options={{
                      title: 'Settings',
                    }}
                  />
                </Stack>
              </ThemeProvider>
            </NotificationProvider>
          </AppLifecycleProvider>
          </DatabaseProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
