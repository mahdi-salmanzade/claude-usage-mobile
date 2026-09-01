# Expo HAS CHANGED

This project is on **Expo SDK 57** (React Native 0.86, Hermes V1).
Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

Hard constraints — do not "helpfully" bump these:

- `expo` must stay `>= 57.0.9` (Hermes V1 memory regression fix, build `250829098.0.16+`).
- `react-native-reanimated` 4.5.1 and `react-native-worklets` **0.10.x exactly** — reanimated
  peers `0.10.x`, so npm's 0.11/0.12 are incompatible despite being newer.
- `react-native-gesture-handler` ~2.32.0, `react-native-screens` ~4.26.0, `react-native-svg` 15.15.4
  (`@tanstack/charts` peers `>=15.15.4 <16`).
- `npx expo prebuild` **cleans by default** on SDK 57. `ios/` and `android/` are gitignored and
  fully generated — put native changes in a config plugin, never in the generated folders.

Install with `npx expo install <pkg>`, never bare `npm install`, so versions match the SDK.
