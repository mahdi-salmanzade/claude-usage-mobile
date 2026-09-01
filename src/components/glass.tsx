/**
 * Liquid Glass surfaces.
 *
 * Three guards, all load-bearing:
 *
 *  - `isGlassEffectAPIAvailable()` gates every render. Some iOS 26 betas ship
 *    without the API and CRASH rather than degrade, so this is not an
 *    optimisation.
 *  - Reduce Transparency stays true even when the glass API is present, and a
 *    user who asked for less transparency should get an opaque surface.
 *  - Off iOS the module renders a plain `<View>`, so the fallback has to carry
 *    its own colour or the surface disappears into the background.
 *
 * Glass needs something behind it to refract. A glass view inside an opaque
 * card reads as flat tinted plastic, so these are for elements that float over
 * content — bars, pills, buttons — not for the cards themselves.
 */
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Radius, usePalette } from '@/lib/design';

/** True only when real glass will actually render for this user, right now. */
export function useGlass(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((v) => active && setReduceTransparency(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return Platform.OS === 'ios' && isGlassEffectAPIAvailable() && !reduceTransparency;
}

/** Whether the OS is running the Liquid Glass design at all (iOS 26+). */
export function liquidGlassAvailable(): boolean {
  return Platform.OS === 'ios' && isLiquidGlassAvailable();
}

export interface GlassSurfaceProps {
  children?: ReactNode;
  /** `regular` refracts and blurs; `clear` is thinner, for small controls. */
  variant?: 'regular' | 'clear';
  radius?: number;
  /** Warm tint so the glass belongs to this app rather than the system. */
  tint?: string;
  /** Reacts to touch with the system's glass highlight. */
  interactive?: boolean;
  /** Used when glass is unavailable. Defaults to the app's sunken surface. */
  fallbackColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function GlassSurface({
  children,
  variant = 'regular',
  radius = Radius.pill,
  tint,
  interactive = false,
  fallbackColor,
  style,
}: GlassSurfaceProps) {
  const p = usePalette();
  const glass = useGlass();

  // `overflow: hidden` is not optional — GlassView does not clip to its own
  // corner radius, so children spill past the rounded edge without it.
  const shape: ViewStyle = { borderRadius: radius, overflow: 'hidden' };

  if (!glass) {
    return (
      <View style={[shape, { backgroundColor: fallbackColor ?? p.surfaceSunken }, style]}>
        {children}
      </View>
    );
  }

  return (
    <GlassView
      glassEffectStyle={variant}
      tintColor={tint}
      isInteractive={interactive}
      colorScheme={p.scheme}
      style={[shape, style]}>
      {children}
    </GlassView>
  );
}

export interface GlassButtonProps extends Omit<PressableProps, 'style'> {
  children?: ReactNode;
  variant?: 'regular' | 'clear';
  radius?: number;
  tint?: string;
  fallbackColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A pressable glass surface.
 *
 * The Pressable sits INSIDE the glass rather than wrapping it: a parent
 * Pressable would animate opacity on the whole glass view and flatten the
 * refraction on every tap. `isInteractive` gives the system's own press
 * response, and the fallback path supplies its own since there is none.
 */
export function GlassButton({
  children,
  variant = 'regular',
  radius = Radius.pill,
  tint,
  fallbackColor,
  style,
  ...pressable
}: GlassButtonProps) {
  const glass = useGlass();

  return (
    <GlassSurface
      variant={variant}
      radius={radius}
      tint={tint}
      interactive
      fallbackColor={fallbackColor}
      style={style}>
      <Pressable
        {...pressable}
        style={({ pressed }) => [
          styles.fill,
          // The system supplies the press response on real glass; without it we
          // have to say something happened.
          !glass && pressed ? { opacity: 0.65 } : null,
        ]}>
        {children}
      </Pressable>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  fill: { alignItems: 'center', justifyContent: 'center' },
});
