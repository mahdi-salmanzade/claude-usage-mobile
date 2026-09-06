import { StyleSheet, Text, View } from 'react-native';
import { Space, Type, type Palette } from '@/lib/design';

interface Props {
  label: string;
  percent: number;
  palette: Palette;
  color: string;
  detail?: string;
  subDetail?: string;
  /** Slimmer treatment for nested/secondary metrics (e.g. Opus/Sonnet). */
  slim?: boolean;
}

export function UsageBar({ label, percent, palette, color, detail, subDetail, slim }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const height = slim ? 6 : 9;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text
          style={[
            slim ? styles.labelSlim : styles.label,
            { color: slim ? palette.textSecondary : palette.text },
          ]}>
          {label}
        </Text>
        <Text style={[styles.percent, { color, fontSize: slim ? Type.label : Type.metric }]}>
          {Math.round(clamped)}%
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: palette.track, height, borderRadius: height / 2 }]}>
        <View
          style={[styles.fill, { width: `${clamped}%`, backgroundColor: color, borderRadius: height / 2 }]}
        />
      </View>

      {(detail || subDetail) && (
        <View style={styles.footerRow}>
          <Text style={[styles.detail, { color: palette.textFaint }]}>{detail ?? ''}</Text>
          <Text style={[styles.detail, { color: palette.textFaint }]}>{subDetail ?? ''}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: Space.sm },
  label: { fontSize: Type.body, fontWeight: '600' },
  labelSlim: { fontSize: Type.label, fontWeight: '500' },
  percent: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { overflow: 'hidden' },
  fill: { height: '100%' },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs, justifyContent: 'space-between', marginTop: Space.sm - 2 },
  detail: { fontSize: Type.caption },
});
