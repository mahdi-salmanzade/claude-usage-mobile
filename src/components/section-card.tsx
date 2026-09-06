import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Space, Type, usePalette } from '@/lib/design';

/** A titled card. The eyebrow is the only place the app uses all-caps. */
export function SectionCard({
  title,
  trailing,
  children,
  style,
  contentStyle,
}: {
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>
      {(title || trailing) && (
        <View style={styles.head}>
          {!!title && (
            <Text style={[styles.title, { color: p.textSecondary }]}>{title.toUpperCase()}</Text>
          )}
          <View style={styles.trailing}>{trailing}</View>
        </View>
      )}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={[styles.sectionLabel, { color: p.textSecondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.xl,
    gap: Space.lg,
  },
  content: { gap: Space.lg },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: Type.micro, fontWeight: '700', letterSpacing: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  sectionLabel: {
    fontSize: Type.micro,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: Space.sm,
    marginTop: Space.lg,
  },
});
