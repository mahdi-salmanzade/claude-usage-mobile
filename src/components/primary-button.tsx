import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlassButton, useGlass } from '@/components/glass';
import { Radius, Space, Type, usePalette } from '@/lib/design';

/**
 * The app's one call-to-action button.
 *
 * On Liquid Glass it is an accent-tinted glass capsule that refracts whatever
 * is behind it; elsewhere it falls back to a solid accent fill. The label
 * colour has to follow that fork — white on a solid accent, but accent-on-glass
 * would be invisible against a tinted translucent surface, so the tinted glass
 * keeps a light label too.
 */
export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const glass = useGlass();

  return (
    <GlassButton
      radius={Radius.pill}
      tint={glass ? p.accent : undefined}
      fallbackColor={p.accent}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[styles.button, (disabled || loading) && styles.disabled, style]}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color="#FFFDFA" />
        ) : (
          <Text style={styles.label}>{title}</Text>
        )}
      </View>
    </GlassButton>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'stretch' },
  disabled: { opacity: 0.6 },
  content: {
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#FFFDFA', fontSize: Type.body, fontWeight: '700' },
});
