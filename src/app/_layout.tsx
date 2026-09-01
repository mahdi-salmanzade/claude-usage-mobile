// Side-effect import, and it must be first: `defineTask` has to have run before
// the OS can wake the background refresh. If it hasn't, TaskManager logs a
// warning and unregisters the task itself.
import '@/lib/tasks';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { usePalette } from '@/lib/design';
import { PairingProvider, usePairing } from '@/lib/pairing';
import { SettingsProvider } from '@/lib/settings';

export default function RootLayout() {
  const palette = usePalette();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.bg }}>
      <SettingsProvider>
        <PairingProvider>
          <ThemeProvider value={palette.scheme === 'dark' ? DarkTheme : DefaultTheme}>
            <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
            <RootNavigator />
          </ThemeProvider>
        </PairingProvider>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Pairing is the app's only gate.
 *
 * `Stack.Protected` removes the guarded screens from the navigator AND from the
 * linking config, so an unpaired install can't be deep-linked past the pairing
 * screen — which matters because the deep link carries a token.
 */
function RootNavigator() {
  const palette = usePalette();
  const { pairing, isLoading } = usePairing();

  // Render nothing rather than a spinner: the keychain read resolves in a frame
  // or two, and a flashed spinner reads as jank.
  if (isLoading) return <View style={{ flex: 1, backgroundColor: palette.bg }} />;

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
      <Stack.Protected guard={!!pairing}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!pairing}>
        <Stack.Screen name="pair" />
      </Stack.Protected>
    </Stack>
  );
}
