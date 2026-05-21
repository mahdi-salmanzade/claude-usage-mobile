import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { PairingProvider } from '@/lib/pairing';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <PairingProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="pair" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </PairingProvider>
  );
}
