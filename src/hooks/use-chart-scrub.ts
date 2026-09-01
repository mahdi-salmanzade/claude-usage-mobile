import { useCallback, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import type { ChartScene } from '@tanstack/charts/types';

/**
 * Scrubbing a banded chart that lives inside a ScrollView.
 *
 * The chart host claims a touch on `onStartShouldSetResponder`, so a finger
 * that came to scroll the page would flash a bucket and fire a tick before the
 * scroll view could take the touch back. Charts using this hook pass
 * `pointer: false` and let the gesture below decide.
 *
 * Two ways in, because only time tells a scrub apart from a page scroll: 6pt of
 * horizontal travel, or a 200ms hold in place. A scroll flick has moved well
 * past 12pt before either fires.
 */
export function useChartScrub<T>(
  items: readonly T[],
  onFocusIndex: (index: number) => void,
  onRelease: () => void,
) {
  const plot = useSharedValue({ start: 0, step: 0, count: 0 });
  const chartWidth = useSharedValue(0);
  const panning = useSharedValue(false);
  const holding = useSharedValue(false);
  const lastIndex = useSharedValue(-1);
  const count = items.length;

  /** Records the plot box the axis leaves for the marks, as scene fractions. */
  const onRender = useCallback(
    ({ scene }: { scene: ChartScene<any, any, any> }) => {
      plot.value =
        scene.width > 0 && count > 0
          ? {
              start: scene.chart.x / scene.width,
              step: scene.chart.width / scene.width / count,
              count,
            }
          : { start: 0, step: 0, count: 0 };
    },
    [plot, count],
  );

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      chartWidth.value = e.nativeEvent.layout.width;
    },
    [chartWidth],
  );

  const gesture = useMemo(() => {
    const scrubTo = (x: number) => {
      'worklet';
      const p = plot.value;
      const w = chartWidth.value;
      if (w <= 0 || p.step <= 0 || p.count === 0) return;
      const raw = Math.floor((x / w - p.start) / p.step);
      const index = Math.min(Math.max(raw, 0), p.count - 1);
      if (index === lastIndex.value) return;
      lastIndex.value = index;
      runOnJS(onFocusIndex)(index);
    };

    // Either recognizer may end first; whichever ends last clears.
    const release = () => {
      'worklet';
      if (panning.value || holding.value) return;
      lastIndex.value = -1;
      runOnJS(onRelease)();
    };

    const pan = Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-14, 14])
      .onStart((e) => {
        panning.value = true;
        scrubTo(e.x);
      })
      .onUpdate((e) => scrubTo(e.x))
      // Fires on failure too — only release a pan that actually activated.
      .onFinalize(() => {
        if (!panning.value) return;
        panning.value = false;
        release();
      });

    // Cancels past 12pt of travel, by which point the pan has taken over.
    const hold = Gesture.LongPress()
      .minDuration(200)
      .maxDistance(12)
      .onStart((e) => {
        holding.value = true;
        scrubTo(e.x);
      })
      .onFinalize(() => {
        if (!holding.value) return;
        holding.value = false;
        release();
      });

    return Gesture.Simultaneous(pan, hold);
  }, [chartWidth, holding, lastIndex, onFocusIndex, onRelease, panning, plot]);

  return { gesture, onRender, onLayout };
}

/**
 * Tracks the currently-scrubbed key so a chart only reports real changes, and
 * so a programmatic clear can't leave a lit band under a bucket nothing reads.
 */
export function useScrubKey() {
  return useRef<string | null>(null);
}
