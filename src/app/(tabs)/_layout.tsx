import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { usePalette } from '@/lib/design';
import { UsageProvider } from '@/lib/usage-context';

/**
 * Native tabs, not a custom bar: on iOS 26 this IS the system's Liquid Glass
 * tab bar, and a hand-rolled one would be a worse copy that also rules out
 * NativeTabs entirely (the two are mutually exclusive).
 *
 * `backgroundColor` and an explicit `blurEffect` are deliberately NOT set —
 * either one replaces the glass material with a flat fill, which is the usual
 * way apps accidentally opt out of Liquid Glass. Only the tint is ours.
 *
 * `UsageProvider` sits here rather than at the root so the poller starts once
 * the app is paired and stops the moment it is unpaired.
 */
export default function TabLayout() {
  const p = usePalette();

  return (
    <UsageProvider>
      <NativeTabs
        tintColor={p.accent}
        // iOS 26+: the bar shrinks to a floating glass pill as you scroll down
        // and expands on the way back up. Ignored on older systems.
        minimizeBehavior="onScrollDown">
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="gauge.medium" md="speed" />
          <NativeTabs.Trigger.Label>Usage</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="analytics">
          <NativeTabs.Trigger.Icon sf="chart.bar.xaxis" md="bar_chart" />
          <NativeTabs.Trigger.Label>Analytics</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </UsageProvider>
  );
}
