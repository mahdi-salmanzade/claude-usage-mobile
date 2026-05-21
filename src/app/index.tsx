import { Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UsageBar } from '@/components/usage-bar';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, fetchUsage, type UsageResponse } from '@/lib/api';
import { formatCurrency, formatTokens, relativeReset, relativeUpdated } from '@/lib/format';
import { usePairing } from '@/lib/pairing';

const REFRESH_MS = 30_000;

export default function Dashboard() {
  const theme = useTheme();
  const { pairing, isLoading: pairingLoading, clear } = usePairing();

  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!pairing) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetchUsage(pairing);
        setData(res);
        setError(null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Something went wrong.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pairing],
  );

  useEffect(() => {
    if (!pairing) return;
    load('initial');
    const id = setInterval(() => load('refresh'), REFRESH_MS);
    return () => clearInterval(id);
  }, [pairing, load]);

  if (pairingLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!pairing) return <Redirect href="/pair" />;

  const usage = data?.usage ?? null;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={theme.textSecondary} />
        }>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Claude Usage</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {data?.profileName ?? `${pairing.host}:${pairing.port}`}
            </Text>
          </View>
          <Pressable onPress={clear} hitSlop={10}>
            <Text style={[styles.unpair, { color: theme.textSecondary }]}>Unpair</Text>
          </Pressable>
        </View>

        {loading && !data && (
          <View style={styles.centerPad}>
            <ActivityIndicator />
          </View>
        )}

        {error && (
          <View style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.bannerText, { color: theme.text }]}>{error}</Text>
            <Pressable onPress={() => load('initial')}>
              <Text style={[styles.retry, { color: '#0A84FF' }]}>Try again</Text>
            </Pressable>
          </View>
        )}

        {data && !data.hasData && !error && (
          <View style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.bannerText, { color: theme.text }]}>
              Connected, but your Mac hasn&apos;t fetched usage yet. Open the menu bar app to refresh.
            </Text>
          </View>
        )}

        {usage && (
          <View>
            <UsageBar
              label="Session (5h)"
              percent={usage.sessionPercentage}
              detail={`${formatTokens(usage.sessionTokensUsed)} / ${formatTokens(usage.sessionLimit)}`}
              subDetail={relativeReset(usage.sessionResetTime)}
            />
            <UsageBar
              label="Weekly (all models)"
              percent={usage.weeklyPercentage}
              detail={`${formatTokens(usage.weeklyTokensUsed)} / ${formatTokens(usage.weeklyLimit)}`}
              subDetail={relativeReset(usage.weeklyResetTime)}
            />
            <UsageBar
              label="Weekly · Opus"
              percent={usage.opusWeeklyPercentage}
              detail={formatTokens(usage.opusWeeklyTokensUsed)}
            />
            <UsageBar
              label="Weekly · Sonnet"
              percent={usage.sonnetWeeklyPercentage}
              detail={formatTokens(usage.sonnetWeeklyTokensUsed)}
              subDetail={usage.sonnetWeeklyResetTime ? relativeReset(usage.sonnetWeeklyResetTime) : ''}
            />

            {usage.costUsed != null && usage.costLimit != null && usage.costLimit > 0 && (
              <UsageBar
                label="Spend"
                percent={(usage.costUsed / usage.costLimit) * 100}
                detail={`${formatCurrency(usage.costUsed, usage.costCurrency ?? 'USD')} / ${formatCurrency(
                  usage.costLimit,
                  usage.costCurrency ?? 'USD',
                )}`}
                color="#0A84FF"
              />
            )}

            {usage.overageBalance != null && usage.overageBalance > 0 && (
              <Text style={[styles.note, { color: theme.textSecondary }]}>
                Overage credit: {formatCurrency(usage.overageBalance, usage.overageBalanceCurrency ?? 'USD')}
              </Text>
            )}

            <Text style={[styles.updated, { color: theme.textSecondary }]}>
              {relativeUpdated(usage.lastUpdated)}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerPad: { paddingVertical: 40 },
  content: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  unpair: { fontSize: 14, fontWeight: '600' },
  banner: { borderRadius: 12, padding: 14, marginBottom: 20 },
  bannerText: { fontSize: 14, lineHeight: 20 },
  retry: { fontSize: 14, fontWeight: '700', marginTop: 8 },
  note: { fontSize: 13, marginTop: 4 },
  updated: { fontSize: 12, marginTop: 16, textAlign: 'center' },
});
