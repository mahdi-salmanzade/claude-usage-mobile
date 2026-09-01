import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Space, Type, usePalette } from '@/lib/design';

/** Range switcher. One selection tick per change, like a native picker. */
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
  return (
    <View style={[styles.wrap, { backgroundColor: p.surfaceSunken }]}>
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
            style={[styles.item, active && { backgroundColor: p.surface }]}>
            <Text style={[styles.text, { color: active ? p.text : p.textSecondary }]}>{s}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: Radius.sm + 2, padding: 3 },
  item: { flex: 1, paddingVertical: 8, borderRadius: Radius.sm, alignItems: 'center' },
  text: { fontSize: Type.label, fontWeight: '600' },
});
