import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

/**
 * Radial tick-fan gauge. Angles are screen-space degrees: 0° = right, 90° = down.
 * `progress` (0..1) wipes each tick from track to fill colour in sequence.
 *
 * Discrete ticks rather than a continuous arc because the quantity is a budget
 * being spent down, and countable segments read as "how many left" at a glance
 * in a way a smooth sweep does not.
 */

const AnimatedLine = Animated.createAnimatedComponent(Line);

interface TickProps {
  index: number;
  tickCount: number;
  startAngle: number;
  sweep: number;
  outerRadius: number;
  tickLength: number;
  tickWidth: number;
  center: number;
  progress: SharedValue<number>;
  fill: string;
  track: string;
}

function Tick({
  index,
  tickCount,
  startAngle,
  sweep,
  outerRadius,
  tickLength,
  tickWidth,
  center,
  progress,
  fill,
  track,
}: TickProps) {
  const angle = ((startAngle + (sweep / (tickCount - 1)) * index) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const inner = outerRadius - tickLength;

  const animatedProps = useAnimatedProps(() => {
    const filled = interpolate(progress.value * tickCount - index, [0, 1], [0, 1], Extrapolation.CLAMP);
    return { stroke: interpolateColor(filled, [0, 1], [track, fill]) };
  });

  return (
    <AnimatedLine
      x1={center + cos * inner}
      y1={center + sin * inner}
      x2={center + cos * outerRadius}
      y2={center + sin * outerRadius}
      strokeWidth={tickWidth}
      strokeLinecap="round"
      animatedProps={animatedProps}
    />
  );
}

export interface TickGaugeProps {
  tickCount: number;
  /** Screen-space degrees (0° = right, 90° = down). */
  startAngle: number;
  /** Signed sweep in degrees; positive = clockwise on screen. */
  sweep: number;
  outerRadius: number;
  tickLength: number;
  tickWidth: number;
  /** 0..1 fill progress. */
  progress: SharedValue<number>;
  fill: string;
  track: string;
  /** A second, dimmer marker on the same arc — the projected level at reset. */
  marker?: SharedValue<number>;
  markerColor?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function TickGauge({
  tickCount,
  startAngle,
  sweep,
  outerRadius,
  tickLength,
  tickWidth,
  progress,
  fill,
  track,
  marker,
  markerColor,
  children,
  style,
}: TickGaugeProps) {
  const size = outerRadius * 2 + tickWidth;
  const center = size / 2;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        {Array.from({ length: tickCount }, (_, i) => (
          <Tick
            key={i}
            index={i}
            tickCount={tickCount}
            startAngle={startAngle}
            sweep={sweep}
            outerRadius={outerRadius}
            tickLength={tickLength}
            tickWidth={tickWidth}
            center={center}
            progress={progress}
            fill={fill}
            track={track}
          />
        ))}
        {marker && (
          <ProjectionMarker
            marker={marker}
            tickCount={tickCount}
            startAngle={startAngle}
            sweep={sweep}
            outerRadius={outerRadius}
            tickLength={tickLength}
            center={center}
            color={markerColor ?? fill}
          />
        )}
      </Svg>
      {children != null && (
        <View style={styles.center} pointerEvents="box-none">
          {children}
        </View>
      )}
    </View>
  );
}

/** A single notch outside the ring showing where the window is projected to land. */
function ProjectionMarker({
  marker,
  tickCount,
  startAngle,
  sweep,
  outerRadius,
  tickLength,
  center,
  color,
}: {
  marker: SharedValue<number>;
  tickCount: number;
  startAngle: number;
  sweep: number;
  outerRadius: number;
  tickLength: number;
  center: number;
  color: string;
}) {
  const animatedProps = useAnimatedProps(() => {
    const clamped = Math.max(0, Math.min(1, marker.value));
    // Match the tick centres: tick i sits at startAngle + sweep*i/(count-1).
    const idx = clamped * tickCount - 0.5;
    const angle = ((startAngle + (sweep / (tickCount - 1)) * idx) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const inner = outerRadius - tickLength - 5;
    const outer = outerRadius - tickLength - 1;
    return {
      x1: center + cos * inner,
      y1: center + sin * inner,
      x2: center + cos * outer,
      y2: center + sin * outer,
      opacity: clamped > 0.02 ? 1 : 0,
    };
  });

  return <AnimatedLine stroke={color} strokeWidth={3} strokeLinecap="round" animatedProps={animatedProps} />;
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
