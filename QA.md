# Simulator QA — September 5, 2026

## Changes

- Restored spacing inside shared section cards; removed competing usage-meter margins.
- Allowed metric units, footers, headers, and diagnostic values to wrap instead of clipping.
- Enlarged segmented controls, refresh controls, settings actions, and threshold buttons to at least 44 points; labeled switches and inputs for accessibility.
- Made pairing scrollable with native keyboard insets, keyboard submission, masked tokens, and shared validation for manual entry, QR payloads, and deep links.
- Added manual-pairing guidance on simulators and a Settings recovery action when camera permission cannot be requested again.
- Restored the history profile from cached usage on offline launch; prevented late cache hydration from replacing a fresh response.
- Invalidated chart queries after history deletion or retention changes; respected the selected retention period during foreground cleanup.
- Improved text contrast in both appearances and fixed refresh feedback after stale or unchanged connection states.
- Gated iOS 26 tab minimization on OS support, preventing the warning on iOS 17.
- Explained percentage-only Codex analytics and hid token-based projections for that provider.
- Fixed React Compiler lint issues in chart shared values, query effects, and web hydration.

## Verified

- Native development build: successful (one existing duplicate `-lc++` linker warning).
- iPhone 17, iOS 26.4: pairing, live polling, Usage/Analytics/Settings navigation, populated analytics, range changes, accessible chart inspection, light/dark appearance, larger text, cached offline relaunch.
- iPhone SE, iOS 17.5: compact pairing layout, keyboard inset behavior and submission, invalid port feedback, server error state and recovery, connected/no-data state, Codex Usage and Analytics, solid-material fallback.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 41 passed, 0 failed, including four pairing-validation tests.
- `git diff --check`: passed.

## Verification limits

The computer-control tool did not reliably deliver scroll/swipe gestures to Simulator. Lower sections were inspected in source and the accessibility tree, but their scrolled appearance, touch chart scrubbing, and keyboard-driven scrolling still need a manual pass. Accessible chart increment and its detail readout were tested. History-clear invalidation was checked in code; the destructive UI action was not exercised.

Physical camera scanning, haptics, notification delivery, widgets/Live Activities, background execution, and Android were not validated. Network scenarios used a local fixture, not the user's live Mac account.

The app is left on iPhone 17 using the **Simulator QA** profile. Metro is on port 8082 and the temporary fixture server listens only on `127.0.0.1:47601`. Synthetic history is confined to the simulator. No Expo or React Native dependency versions were changed.
