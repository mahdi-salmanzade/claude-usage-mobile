import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { statusColor } from '@/lib/format';

interface Props {
  label: string;
  percent: number;
  detail?: string;
  subDetail?: string;
  /** Override the auto status color (e.g. for cost which isn't a limit). */
  color?: string;
}

export function UsageBar({ label, percent, detail, subDetail, color }: Props) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(100, percent));
  const barColor = color ?? statusColor(clamped);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.percent, { color: barColor }]}>{Math.round(clamped)}%</Text>
      </View>

      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: barColor }]} />
      </View>

      <View style={styles.footerRow}>
        <Text style={[styles.detail, { color: theme.textSecondary }]}>{detail ?? ''}</Text>
        <Text style={[styles.detail, { color: theme.textSecondary }]}>{subDetail ?? ''}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 18 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  label: { fontSize: 15, fontWeight: '600' },
  percent: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  detail: { fontSize: 12 },
});
