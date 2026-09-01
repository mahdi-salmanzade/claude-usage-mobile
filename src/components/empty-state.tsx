import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Space, Type, usePalette } from '@/lib/design';

/**
 * The state a chart shows before it has anything to plot.
 *
 * It says what is missing and what will fix it, because "no data" on a screen
 * that silently needs the app to have been open reads as a bug.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const p = usePalette();
  return (
    <View style={[styles.wrap, { backgroundColor: p.surfaceSunken, borderColor: p.border }]}>
      <Text style={[styles.title, { color: p.text }]}>{title}</Text>
      <Text style={[styles.body, { color: p.textSecondary }]}>{body}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.xl,
    gap: Space.sm,
    alignItems: 'center',
  },
  title: { fontSize: Type.body, fontWeight: '700' },
  body: { fontSize: Type.label, lineHeight: 20, textAlign: 'center' },
});
