import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DailyTokensChart, type DayPoint } from '@/components/charts/daily-tokens-chart';
import { SessionBurndown } from '@/components/charts/session-burndown';
import { SplitBar } from '@/components/charts/split-bar';
import { CoverageFooter } from '@/components/coverage-footer';
import { DeltaLabel } from '@/components/delta-label';
import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { ProjectionLine } from '@/components/projection-line';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { TickGauge } from '@/components/tick-gauge';
import { UsageBar } from '@/components/usage-bar';
import { useAnalytics, useLiveMetrics } from '@/hooks/use-analytics';
import { useExternalSync } from '@/hooks/use-external-sync';
import { useNow } from '@/hooks/use-history';
import { effectiveSessionPercentage, hasModelBreakdown, hasTokenCounts, providerLabel } from '@/lib/api';
import { Motion, Radius, Space, Type, statusFor, usePalette } from '@/lib/design';
import { deviceTimeZone } from '@/lib/history';
import {
  formatCurrency,
  formatDuration,
  formatMonthDay,
  formatPercent,
  formatTokens,
  relativeReset,
  shortAgo,
  weekdayInitial,
} from '@/lib/format';
import { usePairing } from '@/lib/pairing';
import { useSettings } from '@/lib/settings';
import { useUsageState } from '@/lib/usage-context';

/** 20 ticks over 270°, opening at the bottom — the same fan as the widget gauge. */
const TICKS = 20;
const START_ANGLE = 135;
const SWEEP = 270;

export default function Overview() {
  const p = usePalette();
  const { pairing, clear } = usePairing();
  const { prefs, ready: prefsReady } = useSettings();
  const { data, conn, errorMessage, lastFetchedAt, refreshing, refresh, historyRevision, profile } =
    useUsageState();
  const now = useNow(15_000);

  const usage = data?.usage ?? null;
  const metrics = useLiveMetrics(profile, historyRevision, usage, now);
  const analytics = useAnalytics(profile, historyRevision, usage, '7d', now);

  useExternalSync(data, prefs, prefsReady, metrics);

  // The Mac zeroes the ring once the window has rolled; without this the phone
  // keeps showing the pre-reset number until the Mac happens to refetch.
  const sessionPct = usage ? effectiveSessionPercentage(usage, now) : 0;
  const ringColor = usage ? statusFor(sessionPct, p) : p.textFaint;

  const progress = useSharedValue(0);
  const marker = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(100, sessionPct)) / 100, {
      duration: Motion.fill,
      easing: Easing.out(Easing.exp),
    });
  }, [sessionPct, progress]);

  const projectedPct =
    metrics?.session.kind === 'safe' || metrics?.session.kind === 'idle'
      ? metrics.session.projectedPct
      : metrics?.session.kind === 'cap-before-reset'
        ? 100
        : 0;
  useEffect(() => {
    marker.value = withTiming(projectedPct / 100, { duration: Motion.fill });
  }, [projectedPct, marker]);

  // Haptic when a manual refresh resolves.
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

  const weekDays = useMemo<DayPoint[]>(
    () =>
      (analytics.data?.days ?? []).slice(-7).map((d, i, all) => ({
        key: d.dayKey,
        label: weekdayInitial(d.dayKey),
        detail: formatMonthDay(d.dayKey),
        tokens: d.tokens,
        opus: d.opus,
        sonnet: d.sonnet,
        other: d.other,
        unattributed: d.unattributed,
        hasCoverage: d.hasCoverage,
        coverage: d.coverage,
        isCurrent: i === all.length - 1,
      })),
    [analytics.data],
  );

  const showTokens = hasTokenCounts(data ?? {});
  const showModels = hasModelBreakdown(data ?? {});

  // Hard error with nothing cached to show.
  if (conn === 'error' && !data) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: p.bg }]}>
        <View style={styles.errorWrap}>
          <Text style={[styles.errorTitle, { color: p.text }]}>Can&apos;t reach your Mac</Text>
          <Text style={[styles.errorBody, { color: p.textSecondary }]}>
            {errorMessage ?? 'Make sure the companion server is on and you share a network.'}
          </Text>
          <PrimaryButton title="Try again" onPress={manualRefresh} style={styles.retry} />
          <Pressable onPress={clear} hitSlop={10} style={{ marginTop: Space.lg }}>
            <Text style={[styles.unpair, { color: p.textFaint }]}>Unpair this Mac</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const updatedLabel = lastFetchedAt ? shortAgo(now - lastFetchedAt) : '';

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: p.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={manualRefresh} tintColor={p.textFaint} />
        }>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={[styles.brandDot, { backgroundColor: p.accent }]} />
            <Text style={[styles.brand, { color: p.text }]}>Claude Usage</Text>
          </View>
          <StatusPill
            conn={conn}
            label={conn === 'live' ? '' : updatedLabel}
            palette={p}
            onPress={manualRefresh}
          />
        </View>
        <Text style={[styles.profile, { color: p.textFaint }]}>
          {data?.profileName ?? `${pairing?.host}:${pairing?.port}`}
          {data?.provider ? ` · ${providerLabel(data.provider)}` : ''}
        </Text>

        {/* Hero: the session gauge, its projection, and the window's shape. */}
        <View style={styles.hero}>
          <TickGauge
            tickCount={TICKS}
            startAngle={START_ANGLE}
            sweep={SWEEP}
            outerRadius={104}
            tickLength={26}
            tickWidth={8}
            progress={progress}
            marker={usage && projectedPct > sessionPct ? marker : undefined}
            markerColor={p.textFaint}
            fill={ringColor}
            track={p.track}>
            <Text style={[styles.ringNumber, { color: ringColor }]}>
              {Math.round(sessionPct)}
              <Text style={[styles.ringPct, { color: ringColor }]}>%</Text>
            </Text>
            <Text style={[styles.ringLabel, { color: p.textSecondary }]}>session used</Text>
            {usage && showTokens && (
              <Text style={[styles.ringDetail, { color: p.textFaint }]}>
                {formatTokens(usage.sessionTokensUsed)} / {formatTokens(usage.sessionLimit)}
              </Text>
            )}
          </TickGauge>

          <Text style={[styles.resetLine, { color: p.textSecondary }]}>
            {usage ? `Session ${relativeReset(usage.sessionResetTime)}` : 'Waiting for first fetch'}
          </Text>
          <View style={styles.projection}>
            <ProjectionLine metrics={metrics} now={now} />
          </View>
        </View>

        {!data?.hasData && (
          <View style={[styles.notice, { backgroundColor: p.surfaceSunken }]}>
            <Text style={[styles.noticeText, { color: p.textSecondary }]}>
              Connected, but your Mac hasn&apos;t fetched usage yet. Open the menu bar app to refresh.
            </Text>
          </View>
        )}

        {/* The current window, spent and projected. */}
        {usage && showTokens && metrics && metrics.sessionWindowStart != null && (
          <SectionCard
            title="This session"
            trailing={
              metrics.burnDisplay != null ? (
                <Text style={[styles.trailing, { color: p.textFaint }]}>
                  {formatTokens(metrics.burnDisplay)}/h
                </Text>
              ) : null
            }>
            {metrics.sessionPoints.length >= 2 ? (
              <SessionBurndown
                points={metrics.sessionPoints}
                limit={usage.sessionLimit}
                startedAt={metrics.sessionWindowStart}
                resetAt={Date.parse(usage.sessionResetTime)}
                nowMac={metrics.nowMac}
                projection={metrics.session}
                burn={metrics.burnProject}
              />
            ) : (
              <EmptyState
                title="Watching this window"
                body="The burn-down needs a couple of snapshots. Leave the app open, or turn on background refresh in Settings."
              />
            )}
          </SectionCard>
        )}

        {usage && (
          <SectionCard title="This week">
            <UsageBar
              label="All models"
              percent={usage.weeklyPercentage}
              palette={p}
              color={statusFor(usage.weeklyPercentage, p)}
              detail={showTokens ? `${formatTokens(usage.weeklyTokensUsed)} / ${formatTokens(usage.weeklyLimit)}` : ''}
              subDetail={relativeReset(usage.weeklyResetTime)}
            />
            {showModels && (
              <>
                <View style={[styles.divider, { backgroundColor: p.border }]} />
                <UsageBar
                  label="Opus"
                  percent={usage.opusWeeklyPercentage}
                  palette={p}
                  color={statusFor(usage.opusWeeklyPercentage, p)}
                  detail={formatTokens(usage.opusWeeklyTokensUsed)}
                  slim
                />
                <UsageBar
                  label="Sonnet"
                  percent={usage.sonnetWeeklyPercentage}
                  palette={p}
                  color={statusFor(usage.sonnetWeeklyPercentage, p)}
                  detail={formatTokens(usage.sonnetWeeklyTokensUsed)}
                  slim
                />
                {usage.designWeeklyTokensUsed > 0 && (
                  <UsageBar
                    label="Design"
                    percent={usage.designWeeklyPercentage}
                    palette={p}
                    color={statusFor(usage.designWeeklyPercentage, p)}
                    detail={formatTokens(usage.designWeeklyTokensUsed)}
                    slim
                  />
                )}
                {usage.fableWeeklyTokensUsed > 0 && (
                  <UsageBar
                    label="Fable"
                    percent={usage.fableWeeklyPercentage}
                    palette={p}
                    color={statusFor(usage.fableWeeklyPercentage, p)}
                    detail={formatTokens(usage.fableWeeklyTokensUsed)}
                    slim
                  />
                )}
              </>
            )}

            {/* Seven days of consumption, and how this week compares so far. */}
            {weekDays.length >= 2 && (
              <>
                <View style={[styles.divider, { backgroundColor: p.border }]} />
                <View style={styles.weekHead}>
                  <Text style={[styles.weekTitle, { color: p.textSecondary }]}>Daily</Text>
                  {analytics.data?.week.pct != null && (
                    <DeltaLabel
                      delta={Math.round(analytics.data.week.pct * 100)}
                      suffix="% vs last week"
                      invert
                      hideZero
                    />
                  )}
                </View>
                <DailyTokensChart points={weekDays} pace={metrics?.dailyPace ?? null} />
              </>
            )}

            {/* The one place a normalised split is honest: a single total. */}
            {showModels && analytics.data && (
              <SplitBar
                segments={[
                  { label: 'Opus', tokens: usage.opusWeeklyTokensUsed, color: p.seriesOpus },
                  { label: 'Sonnet', tokens: usage.sonnetWeeklyTokensUsed, color: p.seriesSonnet },
                  {
                    label: 'Other',
                    tokens: Math.max(
                      0,
                      usage.weeklyTokensUsed - usage.opusWeeklyTokensUsed - usage.sonnetWeeklyTokensUsed,
                    ),
                    color: p.seriesOther,
                  },
                ]}
              />
            )}
          </SectionCard>
        )}

        {/* Codex reports credits instead of tokens. */}
        {usage?.planType != null && (
          <SectionCard title="Plan">
            <View style={styles.spendRow}>
              <Text style={[styles.spendLabel, { color: p.textSecondary }]}>{usage.planType}</Text>
              <Text style={[styles.spendValue, { color: p.text }]}>
                {usage.creditsUnlimited
                  ? 'Unlimited credits'
                  : usage.creditsBalance != null
                    ? `${formatCurrency(usage.creditsBalance)} credits`
                    : ''}
              </Text>
            </View>
          </SectionCard>
        )}

        {usage?.costUsed != null && usage.costLimit != null && usage.costLimit > 0 && (
          <View style={styles.spendRow}>
            <Text style={[styles.spendLabel, { color: p.textSecondary }]}>Spend</Text>
            <Text style={[styles.spendValue, { color: p.text }]}>
              {formatCurrency(usage.costUsed, usage.costCurrency ?? 'USD')}
              <Text style={{ color: p.textFaint }}>
                {' / '}
                {formatCurrency(usage.costLimit, usage.costCurrency ?? 'USD')}
              </Text>
            </Text>
          </View>
        )}

        {usage?.overageBalance != null && usage.overageBalance > 0 && (
          <Text style={[styles.overage, { color: p.textFaint }]}>
            Overage credit {formatCurrency(usage.overageBalance, usage.overageBalanceCurrency ?? 'USD')}
          </Text>
        )}

        {/* Two freshness numbers, because they diverge and only the second one
            gates the projection. */}
        {metrics?.lastObservedAt != null && (
          <Text style={[styles.overage, { color: p.textFaint }]}>
            {`Mac refreshed ${shortAgo(now - metrics.lastObservedAt)}`}
            {metrics.macStale ? ` · projections paused after ${formatDuration(15 * 60_000)}` : ''}
          </Text>
        )}

        {analytics.data && analytics.data.coverage.sampleCount > 0 && (
          <View style={{ marginTop: Space.lg }}>
            <CoverageFooter
              coverage={analytics.data.coverage}
              now={now}
              timezone={usage?.userTimezone?.identifier}
              deviceTimezone={deviceTimeZone()}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space.xl, paddingBottom: Space.xxl * 2, gap: Space.lg },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  brandDot: { width: 10, height: 10, borderRadius: 5 },
  brand: { fontSize: Type.title, fontWeight: '800', letterSpacing: -0.3 },
  profile: { fontSize: Type.caption, marginTop: -Space.md, marginLeft: 18 },

  hero: { alignItems: 'center', marginTop: Space.md },
  ringNumber: { fontSize: Type.hero, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  ringPct: { fontSize: Type.title, fontWeight: '700' },
  ringLabel: { fontSize: Type.label, fontWeight: '600', marginTop: 2 },
  ringDetail: { fontSize: Type.caption, marginTop: Space.sm, fontVariant: ['tabular-nums'] },
  resetLine: { fontSize: Type.body, fontWeight: '600', marginTop: Space.lg },
  projection: { marginTop: Space.sm, paddingHorizontal: Space.lg },

  notice: { borderRadius: Radius.md, padding: Space.lg },
  noticeText: { fontSize: Type.label, lineHeight: 20 },

  trailing: { fontSize: Type.caption, fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Space.xs },
  weekHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekTitle: { fontSize: Type.micro, fontWeight: '700', letterSpacing: 1 },

  spendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: Space.xs },
  spendLabel: { fontSize: Type.body, fontWeight: '600' },
  spendValue: { fontSize: Type.body, fontWeight: '700', fontVariant: ['tabular-nums'] },
  overage: { fontSize: Type.caption, paddingHorizontal: Space.xs },

  unpair: { fontSize: Type.label, fontWeight: '600' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space.xl },
  errorTitle: { fontSize: Type.title, fontWeight: '800', marginBottom: Space.sm },
  errorBody: { fontSize: Type.body, lineHeight: 22, textAlign: 'center', marginBottom: Space.xl },
  retry: { alignSelf: 'center', minWidth: 200 },
});
