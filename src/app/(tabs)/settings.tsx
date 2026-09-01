import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/glass';
import { SectionCard, SectionLabel } from '@/components/section-card';
import { SegmentedControl } from '@/components/segmented-control';
import { useNow } from '@/hooks/use-history';
import { Radius, Space, Type, usePalette } from '@/lib/design';
import {
  clearHistory,
  clockSkew,
  coverage,
  deviceTimeZone,
  getHistoryDb,
  latestSample,
  purge,
  storageBytes,
} from '@/lib/history';
import { formatBytes, formatDuration, formatPercent, shortAgo } from '@/lib/format';
import { ensureNotificationPermission } from '@/lib/notifications';
import { usePairing } from '@/lib/pairing';
import { RETENTION_OPTIONS, useSettings } from '@/lib/settings';

const RETENTION_LABELS = RETENTION_OPTIONS.map((d) => `${d}d`) as unknown as readonly `${number}d`[];
import { backgroundStatus } from '@/lib/tasks';
import { useUsageState } from '@/lib/usage-context';

interface Diagnostics {
  bytes: number;
  samples: number;
  coveragePct: number;
  skewMs: number;
  lastObservedAt: number | null;
  macTimezone: string | null;
  background: { available: boolean; registered: boolean; lastRunAt: number | null };
}

export default function Settings() {
  const p = usePalette();
  const { pairing, clear } = usePairing();
  const { prefs, update } = useSettings();
  const { data, historyRevision, profile } = useUsageState();
  const now = useNow(30_000);

  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    if (!profile) return;
    try {
      const db = await getHistoryDb();
      const [bytes, last, cov, bg] = await Promise.all([
        storageBytes(db),
        latestSample(db, profile),
        coverage(db, profile, now - 7 * 86_400_000, now),
        backgroundStatus(),
      ]);
      const recent = await db.getAllAsync<{ received_at: number; server_time: number }>(
        'SELECT received_at, server_time FROM samples WHERE profile = ? ORDER BY observed_at DESC LIMIT 30',
        [profile],
      );
      setDiag({
        bytes,
        samples: cov.sampleCount,
        coveragePct: cov.fraction * 100,
        skewMs: clockSkew(recent),
        lastObservedAt: last?.observed_at ?? null,
        macTimezone: last?.tz ?? null,
        background: bg,
      });
    } catch {
      setDiag(null);
    }
  }, [profile, now]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics, historyRevision]);

  const toggleNotifications = async (next: boolean) => {
    if (next && !(await ensureNotificationPermission())) return;
    await update({ notifications: next });
  };

  const toggleBackground = async (next: boolean) => {
    setBusy(true);
    await update({ backgroundRefresh: next });
    await loadDiagnostics();
    setBusy(false);
  };

  const setThreshold = (delta: number) => {
    void update({ threshold: Math.max(50, Math.min(95, prefs.threshold + delta)) });
  };

  const applyRetention = async (days: number) => {
    await update({ retentionDays: days });
    if (!profile) return;
    const db = await getHistoryDb();
    await purge(db, profile, Date.now(), days);
    await loadDiagnostics();
  };

  const confirmClear = () => {
    Alert.alert(
      'Clear history?',
      'Every chart is built from this. Your pairing and settings are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            const db = await getHistoryDb();
            await clearHistory(db);
            await loadDiagnostics();
          },
        },
      ],
    );
  };

  const confirmUnpair = () => {
    Alert.alert('Unpair this Mac?', 'You can pair again by scanning the QR code.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unpair', style: 'destructive', onPress: () => void clear() },
    ]);
  };

  const deviceTz = deviceTimeZone();
  const zonesDiffer = !!diag?.macTimezone && diag.macTimezone !== deviceTz;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: p.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: p.text }]}>Settings</Text>

        <SectionLabel>LIVE ACTIVITY</SectionLabel>
        <SectionCard>
          <Row
            title="Show on Lock Screen"
            subtitle="Track your active session in the Dynamic Island and Lock Screen."
            value={prefs.liveActivity}
            onValueChange={(v) => void update({ liveActivity: v })}
          />
        </SectionCard>

        <SectionLabel>NOTIFICATIONS</SectionLabel>
        <SectionCard>
          <Row
            title="Usage alerts"
            subtitle="Get notified when your session runs low and when it resets."
            value={prefs.notifications}
            onValueChange={toggleNotifications}
          />
          {prefs.notifications && (
            <>
              <Divider />
              <View style={styles.stepperRow}>
                <View style={{ flex: 1, paddingRight: Space.lg }}>
                  <Text style={[styles.rowTitle, { color: p.text }]}>Alert threshold</Text>
                  <Text style={[styles.rowSub, { color: p.textSecondary }]}>
                    Notify when session usage crosses this.
                  </Text>
                </View>
                <GlassSurface variant="clear" radius={Radius.sm} style={styles.stepper}>
                  <Pressable
                    onPress={() => setThreshold(-5)}
                    hitSlop={6}
                    style={styles.stepBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Lower the alert threshold">
                    <Text style={[styles.stepSign, { color: p.accent }]}>−</Text>
                  </Pressable>
                  <Text style={[styles.stepValue, { color: p.text }]}>{prefs.threshold}%</Text>
                  <Pressable
                    onPress={() => setThreshold(5)}
                    hitSlop={6}
                    style={styles.stepBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Raise the alert threshold">
                    <Text style={[styles.stepSign, { color: p.accent }]}>+</Text>
                  </Pressable>
                </GlassSurface>
              </View>
              <Divider />
              <Row
                title="Pace warnings"
                subtitle="Warn when your current rate would hit the cap before the window resets — while there's still time to slow down."
                value={prefs.projectionAlerts}
                onValueChange={(v) => void update({ projectionAlerts: v })}
              />
            </>
          )}
        </SectionCard>

        <SectionLabel>HISTORY</SectionLabel>
        <SectionCard>
          <Row
            title="Background refresh"
            subtitle="Keep collecting while the app is closed, so charts and widgets don't go blank. iOS grants these opportunistically, so gaps still happen."
            value={prefs.backgroundRefresh}
            onValueChange={toggleBackground}
            disabled={busy || diag?.background.available === false}
          />
          {diag?.background.available === false && (
            <Text style={[styles.note, { color: p.textFaint }]}>
              Unavailable here — background tasks don&apos;t run on the simulator or in Expo Go.
            </Text>
          )}
          <Divider />
          <View style={styles.stack}>
            <View>
              <Text style={[styles.rowTitle, { color: p.text }]}>Keep raw samples</Text>
              <Text style={[styles.rowSub, { color: p.textSecondary }]}>
                Daily and hourly summaries are kept regardless.
              </Text>
            </View>
            {/* Full width on its own row: three segments beside a two-line
                label squeezed both into wrapping. */}
            <SegmentedControl
              segments={RETENTION_LABELS}
              value={`${prefs.retentionDays}d`}
              onChange={(label) => void applyRetention(Number.parseInt(label, 10))}
            />
          </View>
          <Divider />
          <Pressable onPress={confirmClear} style={styles.actionRow}>
            <Text style={[styles.rowTitle, { color: p.critical }]}>Clear history</Text>
            <Text style={[styles.rowValue, { color: p.textFaint }]}>
              {diag ? formatBytes(diag.bytes) : ''}
            </Text>
          </Pressable>
        </SectionCard>

        <SectionLabel>DIAGNOSTICS</SectionLabel>
        <SectionCard>
          <Info label="Snapshots stored (7d)" value={diag ? `${diag.samples}` : '—'} />
          <Info
            label="Observed coverage (7d)"
            value={diag ? formatPercent(diag.coveragePct) : '—'}
          />
          <Info
            label="Mac last refreshed"
            value={diag?.lastObservedAt ? shortAgo(now - diag.lastObservedAt) : '—'}
          />
          <Info
            label="Clock offset vs Mac"
            value={
              diag == null
                ? '—'
                : Math.abs(diag.skewMs) < 2000
                  ? 'in sync'
                  : `${diag.skewMs > 0 ? '+' : '−'}${formatDuration(Math.abs(diag.skewMs)) || '<1m'}`
            }
          />
          <Info label="Mac timezone" value={diag?.macTimezone ?? '—'} />
          {zonesDiffer && <Info label="This device" value={deviceTz} />}
          <Info
            label="Background refresh"
            value={
              diag == null
                ? '—'
                : !diag.background.available
                  ? 'unavailable'
                  : diag.background.registered
                    ? diag.background.lastRunAt
                      ? `ran ${shortAgo(now - diag.background.lastRunAt)}`
                      : 'registered'
                    : 'off'
            }
          />
          <Info label="Server" value={data?.apiVersion ? `${pairing?.host} · ${data.apiVersion}` : (pairing?.host ?? '—')} />
        </SectionCard>

        <SectionLabel>PAIRING</SectionLabel>
        <SectionCard>
          <Pressable onPress={confirmUnpair} style={styles.actionRow}>
            <Text style={[styles.rowTitle, { color: p.critical }]}>Unpair this Mac</Text>
          </Pressable>
        </SectionCard>

        <Text style={[styles.footnote, { color: p.textFaint }]}>
          Your Claude session key never leaves your Mac. This app only reads the derived usage
          numbers over your local network.
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
  disabled,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1, paddingRight: Space.lg }}>
        <Text style={[styles.rowTitle, { color: p.text }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: p.textSecondary }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: p.accent, false: p.track }}
      />
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: p.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: p.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  const p = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border }} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space.xl, paddingBottom: Space.xxl * 2 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: Type.body, fontWeight: '600' },
  rowSub: { fontSize: Type.caption, marginTop: 2, lineHeight: 17 },
  rowValue: { fontSize: Type.label, fontWeight: '600', fontVariant: ['tabular-nums'] },
  note: { fontSize: Type.micro, lineHeight: 16 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.lg },
  infoLabel: { fontSize: Type.label, flexShrink: 1 },
  stepperRow: { flexDirection: 'row', alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stack: { gap: Space.md },
  stepBtn: { paddingHorizontal: Space.md, paddingVertical: Space.sm },
  stepSign: { fontSize: 20, fontWeight: '700' },
  stepValue: { fontSize: Type.body, fontWeight: '700', minWidth: 42, textAlign: 'center', fontVariant: ['tabular-nums'] },
  footnote: { fontSize: Type.caption, lineHeight: 18, marginTop: Space.xl },
});
