import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { UsageProvider } from '@/lib/usage-context';

/**
 * Native tabs, not a custom bar: on iOS 26 this is the system's own liquid-glass
 * tab bar, which minimises on scroll and matches every other app on the device.
 * A hand-rolled bar would be a worse copy of it, and the two are mutually
 * exclusive anyway.
 *
 * `UsageProvider` sits here rather than at the root so the poller starts only
 * once the app is paired, and stops the moment it is unpaired.
 */
export default function TabLayout() {
  return (
    <UsageProvider>
      <NativeTabs>
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
