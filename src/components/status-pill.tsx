import { StyleSheet, Text, View } from 'react-native';

import { GlassButton } from '@/components/glass';
import { Radius, Space, Type, type Palette } from '@/lib/design';
import type { ConnState } from '@/lib/use-usage';

interface Props {
  conn: ConnState;
  label: string;
  palette: Palette;
  onPress: () => void;
}

/**
 * Connection state, as a floating glass pill.
 *
 * It sits over the scrolling content rather than in it, which is exactly the
 * case Liquid Glass is for — and the status dot keeps carrying the meaning
 * when glass is unavailable.
 */
export function StatusPill({ conn, label, palette, onPress }: Props) {
  const dot = conn === 'live' ? palette.safe : conn === 'error' ? palette.critical : palette.moderate;
  const text =
    conn === 'connecting' ? 'Connecting' : conn === 'live' ? 'Live' : conn === 'stale' ? 'Stale' : 'Offline';

  return (
    <GlassButton
      variant="clear"
      radius={Radius.pill}
      fallbackColor={palette.surfaceSunken}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Connection ${text}. Tap to refresh.`}
      style={styles.pill}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={[styles.text, { color: palette.text }]}>{text}</Text>
        {!!label && <Text style={[styles.sub, { color: palette.textFaint }]}>· {label}</Text>}
      </View>
    </GlassButton>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start' },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm - 1,
    gap: Space.xs + 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: Type.label, fontWeight: '700' },
  sub: { fontSize: Type.caption, fontWeight: '500' },
});
