import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BurnRateChart } from '@/components/charts/burn-rate-chart';
import { DailyTokensChart, type DayPoint } from '@/components/charts/daily-tokens-chart';
import { HourProfileChart } from '@/components/charts/hour-profile-chart';
import { MIN_SPLIT_TOKENS, ModelSplitChart } from '@/components/charts/model-split-chart';
import { WeekCumulativeChart } from '@/components/charts/week-cumulative-chart';
import { WindowPeaks } from '@/components/charts/window-peaks';
import { CoverageFooter } from '@/components/coverage-footer';
import { DeltaLabel } from '@/components/delta-label';
import { EmptyState } from '@/components/empty-state';
import { SectionCard } from '@/components/section-card';
import { SegmentedControl } from '@/components/segmented-control';
import { StatCard } from '@/components/stat-card';
import { useAnalytics, useLiveMetrics } from '@/hooks/use-analytics';
import { type Range, useNow } from '@/hooks/use-history';
import { hasModelBreakdown, hasTokenCounts } from '@/lib/api';
import { Space, Type, usePalette } from '@/lib/design';
import { deviceTimeZone } from '@/lib/history';
import { formatDayDetail, formatMonthDay, formatRate, formatTokens, weekdayInitial } from '@/lib/format';
import { useUsageState } from '@/lib/usage-context';

const RANGES = ['24h', '7d', '30d'] as const;

export default function Analytics() {
  const p = usePalette();
  const { data, historyRevision, profile } = useUsageState();
  const now = useNow(30_000);

  const [range, setRange] = useState<Range>('7d');
  const [scrubbed, setScrubbed] = useState<DayPoint | null>(null);

  const usage = data?.usage ?? null;
  const metrics = useLiveMetrics(profile, historyRevision, usage, now);
  const { data: analytics, loading } = useAnalytics(profile, historyRevision, usage, range, now);

  const showModels = hasModelBreakdown(data ?? {});

  const points = useMemo<DayPoint[]>(
    () =>
      (analytics?.days ?? []).map((d, i, all) => ({
        key: d.dayKey,
        label: range === '30d' ? formatMonthDay(d.dayKey) : weekdayInitial(d.dayKey),
        detail: formatDayDetail(d.dayKey),
        tokens: d.tokens,
        opus: d.opus,
        sonnet: d.sonnet,
        other: d.other,
        unattributed: d.unattributed,
        hasCoverage: d.hasCoverage,
        coverage: d.coverage,
        isCurrent: i === all.length - 1,
      })),
    [analytics?.days, range],
  );

  const totals = useMemo(() => {
    const covered = points.filter((d) => d.hasCoverage);
    const total = covered.reduce((s, d) => s + d.tokens, 0);
    const busiest = covered.reduce<DayPoint | null>(
      (best, d) => (best == null || d.tokens > best.tokens ? d : best),
      null,
    );
    return {
      total,
      perDay: covered.length > 0 ? total / covered.length : 0,
      busiest,
      days: covered.length,
    };
  }, [points]);

  const showTokens = hasTokenCounts(data ?? {});
  const hasHistory = (analytics?.coverage.sampleCount ?? 0) > 1;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: p.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: p.text }]}>Analytics</Text>
        </View>
        <SegmentedControl segments={RANGES} value={range} onChange={setRange} />

        {!showTokens || !hasHistory ? (
          <View style={{ marginTop: Space.xl }}>
            <EmptyState
              title={!showTokens ? 'Token analytics unavailable' : loading ? 'Loading history' : 'No history yet'}
              body={
                !showTokens
                  ? 'Codex reports usage percentages rather than token counts. Check the Usage tab for your session and weekly limits.'
                  : loading
                  ? ' '
                  : 'Your Mac only reports a snapshot, so this app builds history as it watches. Charts fill in over the next few hours — turn on background refresh in Settings so it keeps collecting when the app is closed.'
              }
            />
          </View>
        ) : (
          <>
            {/* Headline totals for the selected range. */}
            <View style={styles.statRow}>
              <StatCard
                label="Total"
                value={formatTokens(totals.total)}
                unit="tokens"
                footer={
                  analytics?.week.pct != null && range === '7d' ? (
                    <DeltaLabel
                      delta={Math.round(analytics.week.pct * 100)}
                      suffix="% vs last week"
                      invert
                      hideZero
                    />
                  ) : null
                }
              />
              <StatCard
                label="Per day"
                value={formatTokens(totals.perDay)}
                unit={`over ${totals.days}d`}
              />
            </View>
            <View style={styles.statRow}>
              <StatCard
                label="Burn rate"
                value={metrics?.burnDisplay != null ? formatTokens(metrics.burnDisplay) : '—'}
                unit={metrics?.burnDisplay != null ? '/h' : ''}
                footer={
                  metrics?.macStale ? (
                    <Text style={[styles.footNote, { color: p.textFaint }]}>Mac stale</Text>
                  ) : null
                }
              />
              <StatCard
                label="Busiest"
                value={totals.busiest ? formatTokens(totals.busiest.tokens) : '—'}
                unit={totals.busiest ? totals.busiest.detail.split(',')[0] : ''}
              />
            </View>

            {/* Daily bars, with the scrub read out above the hand. */}
            <SectionCard
              title={scrubbed ? scrubbed.detail : 'Tokens per day'}
              trailing={
                <Text style={[styles.trailing, { color: p.textSecondary }]}>
                  {scrubbed
                    ? scrubbed.hasCoverage
                      ? `${formatTokens(scrubbed.tokens)} · ${Math.round(scrubbed.coverage * 100)}% observed`
                      : 'Not observed'
                    : ''}
                </Text>
              }>
              <DailyTokensChart
                points={points}
                pace={metrics?.dailyPace ?? null}
                onScrub={setScrubbed}
              />
              <Text style={[styles.caption, { color: p.textFaint }]}>
                Hollow bars are days the app wasn&apos;t watching — not days with no usage.
              </Text>
            </SectionCard>

            {/* Rate over time. */}
            {analytics && analytics.rates.length > 1 && (
              <SectionCard
                title="Burn rate"
                trailing={
                  metrics?.sessionPace != null && metrics.sessionPace >= 1000 ? (
                    <Text style={[styles.trailing, { color: p.textFaint }]}>
                      {`pace ${formatRate(metrics.sessionPace)}`}
                    </Text>
                  ) : null
                }>
                <BurnRateChart
                  samples={analytics.rates}
                  pace={metrics?.sessionPace != null && metrics.sessionPace >= 1000 ? metrics.sessionPace : null}
                  from={now - (range === '24h' ? 86_400_000 : range === '7d' ? 7 * 86_400_000 : 30 * 86_400_000)}
                  to={now}
                />
                <Text style={[styles.caption, { color: p.textFaint }]}>
                  Steps, not a curve: each measurement covers an interval, and breaks are gaps we
                  didn&apos;t observe.
                </Text>
              </SectionCard>
            )}

            {/* Model split, absolute so a light day stays light. */}
            {showModels && points.some((d) => d.tokens >= MIN_SPLIT_TOKENS) && (
              <SectionCard title="By model">
                <ModelSplitChart points={points} />
                <Text style={[styles.caption, { color: p.textFaint }]}>
                  Days under {formatTokens(MIN_SPLIT_TOKENS)} are omitted — their split is mostly
                  rounding.
                </Text>
              </SectionCard>
            )}

            {/* When the work happens. */}
            {analytics && (
              <SectionCard title="By hour">
                <HourProfileChart buckets={analytics.hours} />
              </SectionCard>
            )}

            {/* Pace against last week. */}
            {analytics && analytics.currentWeek.length > 1 && (
              <SectionCard
                title="This week vs last"
                trailing={
                  analytics.week.prior != null ? (
                    <Text style={[styles.trailing, { color: p.textFaint }]}>
                      {`${formatTokens(analytics.week.current)} vs ${formatTokens(analytics.week.prior)}`}
                    </Text>
                  ) : null
                }>
                <WeekCumulativeChart
                  current={analytics.currentWeek}
                  prior={analytics.priorWeek}
                  fraction={analytics.week.fraction}
                />
                {analytics.week.prior == null && (
                  <Text style={[styles.caption, { color: p.textFaint }]}>
                    Last week isn&apos;t covered well enough to compare against yet.
                  </Text>
                )}
              </SectionCard>
            )}

            {/* Per-window peaks, instead of a sawtooth session series. */}
            {analytics && analytics.windows.length > 1 && (
              <SectionCard title="Session windows">
                <WindowPeaks windows={analytics.windows} />
              </SectionCard>
            )}

            {analytics && (
              <View style={{ marginTop: Space.md }}>
                <CoverageFooter
                  coverage={analytics.coverage}
                  now={now}
                  timezone={usage?.userTimezone?.identifier}
                  deviceTimezone={deviceTimeZone()}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space.xl, paddingBottom: Space.xxl * 2, gap: Space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  statRow: { flexDirection: 'row', gap: Space.md },
  trailing: { fontSize: Type.caption, fontVariant: ['tabular-nums'] },
  caption: { fontSize: Type.micro, lineHeight: 16 },
  footNote: { fontSize: Type.micro },
});
