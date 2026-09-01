import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Space, Type, usePalette } from '@/lib/design';

/**
 * One number with its label and unit. Cards in a row reserve the footer line
 * whether or not they have one, so siblings keep the same height.
 */
export interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  /** Delta pill, caption, or anything else that belongs under the value. */
  footer?: ReactNode;
  /** The value is ink by default — colour it only when the value IS a status. */
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
}

const FOOTER_HEIGHT = 18;

export function StatCard({ label, value, unit, footer, valueColor, style }: StatCardProps) {
  const p = usePalette();
  return (
    <View
      style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>
      <Text style={[styles.label, { color: p.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: valueColor ?? p.text }]} numberOfLines={1}>
          {value}
        </Text>
        {!!unit && <Text style={[styles.unit, { color: p.textFaint }]}>{unit}</Text>}
      </View>
      <View style={styles.footerSlot}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    gap: Space.xs,
  },
  label: { fontSize: Type.micro, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Space.xs },
  value: { fontSize: Type.title, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.4 },
  unit: { fontSize: Type.caption, fontWeight: '600' },
  footerSlot: { height: FOOTER_HEIGHT, justifyContent: 'center' },
});
