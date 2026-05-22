import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radius, Space, Type, type Palette } from '@/lib/design';
import type { ConnState } from '@/lib/use-usage';

interface Props {
  conn: ConnState;
  label: string;
  palette: Palette;
  onPress: () => void;
}

export function StatusPill({ conn, label, palette, onPress }: Props) {
  const dot =
    conn === 'live' ? palette.safe : conn === 'error' ? palette.critical : palette.moderate;
  const text =
    conn === 'connecting' ? 'Connecting' : conn === 'live' ? 'Live' : conn === 'stale' ? 'Stale' : 'Offline';

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: palette.surfaceSunken, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.text, { color: palette.text }]}>{text}</Text>
      {!!label && <Text style={[styles.sub, { color: palette.textFaint }]}>· {label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm - 1,
    borderRadius: Radius.pill,
    gap: Space.xs + 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: Type.label, fontWeight: '700' },
  sub: { fontSize: Type.caption, fontWeight: '500' },
});
