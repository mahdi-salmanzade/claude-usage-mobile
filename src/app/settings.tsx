import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { Radius, Space, Type, usePalette } from '@/lib/design';
import { ensureNotificationPermission } from '@/lib/notifications';
import { useSettings } from '@/lib/settings';

export default function Settings() {
  const p = usePalette();
  const router = useRouter();
  const { prefs, update } = useSettings();
  useTheme(); // ensure theme subscription

  const toggleNotifications = async (next: boolean) => {
    if (next) {
      const granted = await ensureNotificationPermission();
      if (!granted) return; // leave off if permission denied
    }
    update({ notifications: next });
  };

  const setThreshold = (delta: number) => {
    const next = Math.max(50, Math.min(95, prefs.threshold + delta));
    update({ threshold: next });
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.back, { color: p.accent }]}>Done</Text>
        </Pressable>
        <Text style={[styles.title, { color: p.text }]}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: p.textSecondary }]}>LIVE ACTIVITY</Text>
        <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Row
            title="Show on Lock Screen"
            subtitle="Track your active session in the Dynamic Island and Lock Screen."
            value={prefs.liveActivity}
            onValueChange={(v) => update({ liveActivity: v })}
            accent={p.accent}
            track={p.track}
            textColor={p.text}
            subColor={p.textSecondary}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: p.textSecondary }]}>NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Row
            title="Usage alerts"
            subtitle="Get notified when your session runs low and when it resets."
            value={prefs.notifications}
            onValueChange={toggleNotifications}
            accent={p.accent}
            track={p.track}
            textColor={p.text}
            subColor={p.textSecondary}
          />
          {prefs.notifications && (
            <>
              <View style={[styles.divider, { backgroundColor: p.border }]} />
              <View style={styles.stepperRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: p.text }]}>Alert threshold</Text>
                  <Text style={[styles.rowSub, { color: p.textSecondary }]}>
                    Notify when session usage crosses this.
                  </Text>
                </View>
                <View style={[styles.stepper, { backgroundColor: p.surfaceSunken }]}>
                  <Pressable onPress={() => setThreshold(-5)} hitSlop={6} style={styles.stepBtn}>
                    <Text style={[styles.stepSign, { color: p.accent }]}>−</Text>
                  </Pressable>
                  <Text style={[styles.stepValue, { color: p.text }]}>{prefs.threshold}%</Text>
                  <Pressable onPress={() => setThreshold(5)} hitSlop={6} style={styles.stepBtn}>
                    <Text style={[styles.stepSign, { color: p.accent }]}>+</Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>

        <Text style={[styles.footnote, { color: p.textFaint }]}>
          The widget and Live Activity update while the app is open or refreshing in the background. Add the widget
          from your Home Screen or Lock Screen.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  title,
  subtitle,
  value,
  onValueChange,
  accent,
  track,
  textColor,
  subColor,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  accent: string;
  track: string;
  textColor: string;
  subColor: string;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: Space.lg }}>
        <Text style={[styles.rowTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: subColor }]}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: accent, false: track }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.xl, paddingVertical: Space.md },
  back: { fontSize: Type.body, fontWeight: '600' },
  title: { fontSize: Type.metric, fontWeight: '700' },
  content: { padding: Space.xl, paddingTop: Space.sm },
  sectionTitle: { fontSize: Type.caption, fontWeight: '700', letterSpacing: 1, marginBottom: Space.sm, marginTop: Space.lg },
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Space.lg, paddingVertical: Space.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Space.md },
  rowTitle: { fontSize: Type.body, fontWeight: '600' },
  rowSub: { fontSize: Type.caption, marginTop: 2, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth },
  stepperRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.sm, overflow: 'hidden' },
  stepBtn: { paddingHorizontal: Space.md, paddingVertical: Space.sm },
  stepSign: { fontSize: 20, fontWeight: '700' },
  stepValue: { fontSize: Type.body, fontWeight: '700', minWidth: 42, textAlign: 'center', fontVariant: ['tabular-nums'] },
  footnote: { fontSize: Type.caption, lineHeight: 18, marginTop: Space.xl },
});
