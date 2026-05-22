import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { usePalette } from '@/lib/design';
import { PairingProvider } from '@/lib/pairing';
import { SettingsProvider } from '@/lib/settings';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const palette = usePalette();
  return (
    <SettingsProvider>
      <PairingProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="pair" options={{ presentation: 'card' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
      </PairingProvider>
    </SettingsProvider>
  );
}
