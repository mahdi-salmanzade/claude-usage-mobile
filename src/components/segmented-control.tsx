import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text } from 'react-native';

import { GlassSurface, useGlass } from '@/components/glass';
import { Radius, Type, usePalette } from '@/lib/design';

/**
 * Range switcher.
 *
 * The track is glass and the selected thumb is a brighter glass layer on top —
 * the same two-level treatment the system uses, so selection still reads
 * clearly once the track itself is translucent. One selection tick per change,
 * like a native picker.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: readonly T[];
  value: T;
  onChange: (next: T) => void;
}) {
  const p = usePalette();
  const glass = useGlass();

  return (
    <GlassSurface
      variant="clear"
      radius={Radius.sm + 4}
      fallbackColor={p.surfaceSunken}
      style={styles.wrap}>
      {segments.map((s) => {
        const active = s === value;
        return (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync();
              onChange(s);
            }}
            style={styles.item}>
            {active && (
              <GlassSurface
                variant="regular"
                radius={Radius.sm}
                // On glass the thumb needs a tint to separate from the track;
                // on the fallback it needs a solid surface for the same reason.
                tint={glass ? p.surface : undefined}
                fallbackColor={p.surface}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text style={[styles.text, { color: active ? p.text : p.textSecondary }]}>{s}</Text>
          </Pressable>
        );
      })}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 3 },
  item: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { fontSize: Type.label, fontWeight: '600', textAlign: 'center' },
});
