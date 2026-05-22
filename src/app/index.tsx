import * as Haptics from 'expo-haptics';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionRing } from '@/components/session-ring';
import { StatusPill } from '@/components/status-pill';
import { UsageBar } from '@/components/usage-bar';
import { useExternalSync } from '@/hooks/use-external-sync';
import { useTicker } from '@/hooks/use-ticker';
import { Radius, Space, Type, statusFor, usePalette } from '@/lib/design';
import { formatCurrency, formatTokens, relativeReset, relativeUpdated } from '@/lib/format';
import { usePairing } from '@/lib/pairing';
import { useSettings } from '@/lib/settings';
import { useUsage } from '@/lib/use-usage';

export default function Dashboard() {
  const p = usePalette();
  const router = useRouter();
  const { pairing, isLoading: pairingLoading, clear } = usePairing();
  const { prefs, ready: prefsReady } = useSettings();
  const { data, conn, errorMessage, lastFetchedAt, refreshing, refresh } = useUsage(pairing);
  useTicker(15_000); // keep "resets in" / "updated" labels live
  useExternalSync(data, prefs, prefsReady); // feed widget / live activity / notifications

  // Haptic feedback when a manual refresh resolves.
  const manualPending = useRef(false);
  useEffect(() => {
    if (!manualPending.current) return;
    if (conn === 'live') {
      manualPending.current = false;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (conn === 'error') {
      manualPending.current = false;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [conn]);

  const manualRefresh = () => {
    manualPending.current = true;
    Haptics.selectionAsync();
    refresh();
  };

  if (pairingLoading) {
    return (
      <View style={[styles.center, { backgroundColor: p.bg }]}>
        <ActivityIndicator color={p.accent} />
      </View>
    );
  }
  if (!pairing) return <Redirect href="/pair" />;

  const usage = data?.usage ?? null;
  const updatedLabel = lastFetchedAt
    ? relativeUpdated(new Date(lastFetchedAt).toISOString()).replace('Updated ', '')
    : '';

  // Hard error with nothing cached to show.
  if (conn === 'error' && !data) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: p.bg }]}>
        <View style={styles.errorWrap}>
          <Text style={[styles.errorTitle, { color: p.text }]}>Can&apos;t reach your Mac</Text>
          <Text style={[styles.errorBody, { color: p.textSecondary }]}>
            {errorMessage ?? 'Make sure the companion server is on and you share a network.'}
          </Text>
          <Pressable style={[styles.primaryBtn, { backgroundColor: p.accent }]} onPress={manualRefresh}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
          <Pressable onPress={clear} hitSlop={10} style={{ marginTop: Space.lg }}>
            <Text style={[styles.unpair, { color: p.textFaint }]}>Unpair this Mac</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const sessionUsed = usage?.sessionPercentage ?? 0;
  const ringColor = usage ? statusFor(sessionUsed, p) : p.textFaint;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: p.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={manualRefresh} tintColor={p.textFaint} />}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={[styles.brandDot, { backgroundColor: p.accent }]} />
            <Text style={[styles.brand, { color: p.text }]}>Claude Usage</Text>
          </View>
          <View style={styles.headerActions}>
            <StatusPill conn={conn} label={conn === 'live' ? '' : updatedLabel} palette={p} onPress={manualRefresh} />
            <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.gear}>
              <Text style={[styles.gearGlyph, { color: p.textSecondary }]}>⚙</Text>
            </Pressable>
          </View>
        </View>
        <Text style={[styles.profile, { color: p.textFaint }]}>
          {data?.profileName ?? `${pairing.host}:${pairing.port}`}
        </Text>

        {/* Hero: session ring */}
        <View style={styles.hero}>
          <SessionRing percent={sessionUsed} color={ringColor} trackColor={p.track}>
            <Text style={[styles.ringNumber, { color: ringColor }]}>
              {Math.round(sessionUsed)}
              <Text style={[styles.ringPct, { color: ringColor }]}>%</Text>
            </Text>
            <Text style={[styles.ringLabel, { color: p.textSecondary }]}>session used</Text>
            {usage && (
              <Text style={[styles.ringDetail, { color: p.textFaint }]}>
                {formatTokens(usage.sessionTokensUsed)} / {formatTokens(usage.sessionLimit)}
              </Text>
            )}
          </SessionRing>
          <Text style={[styles.resetLine, { color: p.textSecondary }]}>
            {usage ? `Session ${relativeReset(usage.sessionResetTime)}` : 'Waiting for first fetch'}
          </Text>
        </View>

        {!data?.hasData && (
          <View style={[styles.notice, { backgroundColor: p.surfaceSunken }]}>
            <Text style={[styles.noticeText, { color: p.textSecondary }]}>
              Connected, but your Mac hasn&apos;t fetched usage yet. Open the menu bar app to refresh.
            </Text>
          </View>
        )}

        {usage && (
          <View style={[styles.section, { backgroundColor: p.surface, borderColor: p.border }]}>
            <Text style={[styles.sectionTitle, { color: p.textSecondary }]}>THIS WEEK</Text>
            <UsageBar
              label="All models"
              percent={usage.weeklyPercentage}
              palette={p}
              color={statusFor(usage.weeklyPercentage, p)}
              detail={`${formatTokens(usage.weeklyTokensUsed)} / ${formatTokens(usage.weeklyLimit)}`}
              subDetail={relativeReset(usage.weeklyResetTime)}
            />
            <View style={[styles.divider, { backgroundColor: p.border }]} />
            <UsageBar label="Opus" percent={usage.opusWeeklyPercentage} palette={p}
              color={statusFor(usage.opusWeeklyPercentage, p)} detail={formatTokens(usage.opusWeeklyTokensUsed)} slim />
            <UsageBar label="Sonnet" percent={usage.sonnetWeeklyPercentage} palette={p}
              color={statusFor(usage.sonnetWeeklyPercentage, p)} detail={formatTokens(usage.sonnetWeeklyTokensUsed)} slim />
          </View>
        )}

        {usage?.costUsed != null && usage.costLimit != null && usage.costLimit > 0 && (
          <View style={styles.spendRow}>
            <Text style={[styles.spendLabel, { color: p.textSecondary }]}>Spend</Text>
            <Text style={[styles.spendValue, { color: p.text }]}>
              {formatCurrency(usage.costUsed, usage.costCurrency ?? 'USD')}
              <Text style={{ color: p.textFaint }}> / {formatCurrency(usage.costLimit, usage.costCurrency ?? 'USD')}</Text>
            </Text>
          </View>
        )}

        {usage?.overageBalance != null && usage.overageBalance > 0 && (
          <Text style={[styles.overage, { color: p.textFaint }]}>
            Overage credit {formatCurrency(usage.overageBalance, usage.overageBalanceCurrency ?? 'USD')}
          </Text>
        )}

        <Pressable onPress={clear} hitSlop={10} style={styles.footerUnpair}>
          <Text style={[styles.unpair, { color: p.textFaint }]}>Unpair</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Space.xl, paddingBottom: Space.xxl },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  gear: { paddingHorizontal: Space.xs },
  gearGlyph: { fontSize: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  brandDot: { width: 10, height: 10, borderRadius: 5 },
  brand: { fontSize: Type.title, fontWeight: '800', letterSpacing: -0.3 },
  profile: { fontSize: Type.caption, marginTop: Space.xs, marginLeft: 18 },

  hero: { alignItems: 'center', marginTop: Space.xl, marginBottom: Space.xl },
  ringNumber: { fontSize: Type.hero, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  ringPct: { fontSize: Type.title, fontWeight: '700' },
  ringLabel: { fontSize: Type.label, fontWeight: '600', marginTop: 2 },
  ringDetail: { fontSize: Type.caption, marginTop: Space.sm, fontVariant: ['tabular-nums'] },
  resetLine: { fontSize: Type.body, fontWeight: '600', marginTop: Space.lg },

  notice: { borderRadius: Radius.md, padding: Space.lg, marginBottom: Space.lg },
  noticeText: { fontSize: Type.label, lineHeight: 20 },

  section: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Space.xl, marginTop: Space.sm },
  sectionTitle: { fontSize: Type.caption, fontWeight: '700', letterSpacing: 1, marginBottom: Space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Space.sm, marginBottom: Space.lg },

  spendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: Space.xl, paddingHorizontal: Space.xs },
  spendLabel: { fontSize: Type.body, fontWeight: '600' },
  spendValue: { fontSize: Type.body, fontWeight: '700', fontVariant: ['tabular-nums'] },
  overage: { fontSize: Type.caption, marginTop: Space.md, paddingHorizontal: Space.xs },

  footerUnpair: { alignSelf: 'center', marginTop: Space.xxl },
  unpair: { fontSize: Type.label, fontWeight: '600' },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space.xl },
  errorTitle: { fontSize: Type.title, fontWeight: '800', marginBottom: Space.sm },
  errorBody: { fontSize: Type.body, lineHeight: 22, textAlign: 'center', marginBottom: Space.xl },
  primaryBtn: { borderRadius: Radius.md, paddingVertical: Space.md + 2, paddingHorizontal: Space.xxl },
  primaryBtnText: { color: '#FFFDFA', fontSize: Type.body, fontWeight: '700' },
});
