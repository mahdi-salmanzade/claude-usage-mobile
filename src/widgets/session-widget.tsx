import { Divider, Gauge, HStack, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/** Everything is preformatted by the app (the layout runs in the widget's own runtime). */
export type SessionWidgetProps = {
  hasData: boolean;
  updated: string; // "2m ago"

  sessionFraction: number;
  sessionPctText: string; // "76%"
  sessionReset: string; // "1h 40m left"
  sessionTokens: string; // "168K / 220K"
  sessionAccent: string;

  weeklyFraction: number;
  weeklyPctText: string;
  weeklyReset: string;
  weeklyTokens: string;
  weeklyAccent: string;

  opusFraction: number;
  opusPctText: string;
  opusTokens: string;
  opusAccent: string;

  sonnetFraction: number;
  sonnetPctText: string;
  sonnetTokens: string;
  sonnetAccent: string;

  hasCost: boolean;
  costText: string; // "$18.75 / $50.00"
  costFraction: number;
};

const SessionWidget = (props: SessionWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const family = environment.widgetFamily;
  const dark = environment.colorScheme === 'dark';
  const bg = dark ? '#1A1613' : '#FAF7F2';
  const faint = '#8A8A8A';
  const surface = containerBackground(bg, 'widget');
  const clear = containerBackground('#00000000', 'widget');
  const gaugeAccent = props.hasData ? props.sessionAccent : faint;

  // A label + value header over a thin progress bar.
  const metricRow = (label: string, value: string, fraction: number, color: string) => (
    <VStack alignment="leading" spacing={3}>
      <HStack>
        <Text modifiers={[font({ size: 12, weight: 'semibold' })]}>{label}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 11 }), foregroundStyle(faint)]}>{value}</Text>
      </HStack>
      <ProgressView value={fraction} modifiers={[foregroundStyle(color)]} />
    </VStack>
  );

  if (family === 'accessoryInline') {
    return <Text modifiers={[clear]}>Claude {props.hasData ? props.sessionPctText : '—'}</Text>;
  }

  if (family === 'accessoryCircular') {
    return (
      <Gauge
        value={props.sessionFraction}
        modifiers={[clear, foregroundStyle(gaugeAccent)]}
        currentValueLabel={<Text modifiers={[font({ size: 13, weight: 'bold' })]}>{props.sessionPctText}</Text>}
      />
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[clear]}>
        <Text modifiers={[font({ weight: 'semibold' })]}>Claude · {props.sessionPctText} session</Text>
        <ProgressView value={props.sessionFraction} />
        <Text modifiers={[font({ size: 11 })]}>
          Wk {props.weeklyPctText} · O {props.opusPctText} · S {props.sonnetPctText}
        </Text>
      </VStack>
    );
  }

  if (family === 'systemSmall') {
    return (
      <VStack spacing={7} modifiers={[surface, padding({ all: 13 })]}>
        <Gauge
          value={props.sessionFraction}
          modifiers={[foregroundStyle(gaugeAccent)]}
          currentValueLabel={<Text modifiers={[font({ size: 17, weight: 'bold' })]}>{props.sessionPctText}</Text>}
        />
        <Text modifiers={[font({ size: 10 }), foregroundStyle(faint)]}>
          {props.hasData ? props.sessionReset : 'No data yet'}
        </Text>
        {metricRow('Week', props.weeklyPctText, props.weeklyFraction, props.weeklyAccent)}
      </VStack>
    );
  }

  if (family === 'systemMedium') {
    return (
      <HStack spacing={16} modifiers={[surface, padding({ all: 16 })]}>
        <VStack spacing={5}>
          <Gauge
            value={props.sessionFraction}
            modifiers={[foregroundStyle(gaugeAccent)]}
            currentValueLabel={<Text modifiers={[font({ size: 16, weight: 'bold' })]}>{props.sessionPctText}</Text>}
          />
          <Text modifiers={[font({ size: 10 }), foregroundStyle(faint)]}>{props.hasData ? props.sessionReset : '—'}</Text>
        </VStack>
        <VStack alignment="leading" spacing={9}>
          {metricRow('This week', props.weeklyTokens, props.weeklyFraction, props.weeklyAccent)}
          {metricRow('Opus', props.opusTokens, props.opusFraction, props.opusAccent)}
          {metricRow('Sonnet', props.sonnetTokens, props.sonnetFraction, props.sonnetAccent)}
        </VStack>
      </HStack>
    );
  }

  // systemLarge — full breakdown
  return (
    <VStack alignment="leading" spacing={11} modifiers={[surface, padding({ all: 18 })]}>
      <HStack>
        <Text modifiers={[font({ size: 16, weight: 'bold' })]}>Claude Usage</Text>
        <Spacer />
        <Text modifiers={[font({ size: 11 }), foregroundStyle(faint)]}>{props.hasData ? props.updated : 'no data'}</Text>
      </HStack>

      <HStack spacing={16}>
        <Gauge
          value={props.sessionFraction}
          modifiers={[foregroundStyle(gaugeAccent)]}
          currentValueLabel={<Text modifiers={[font({ size: 20, weight: 'bold' })]}>{props.sessionPctText}</Text>}
        />
        <VStack alignment="leading" spacing={3}>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(faint)]}>SESSION (5H)</Text>
          <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{props.sessionTokens}</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(faint)]}>{props.sessionReset}</Text>
        </VStack>
      </HStack>

      <Divider />

      {metricRow('This week', props.weeklyTokens + '  ·  ' + props.weeklyReset, props.weeklyFraction, props.weeklyAccent)}
      {metricRow('Opus', props.opusTokens, props.opusFraction, props.opusAccent)}
      {metricRow('Sonnet', props.sonnetTokens, props.sonnetFraction, props.sonnetAccent)}

      {props.hasCost ? (
        <HStack>
          <Text modifiers={[font({ size: 13, weight: 'semibold' })]}>Spend</Text>
          <Spacer />
          <Text modifiers={[font({ size: 13 }), foregroundStyle(faint)]}>{props.costText}</Text>
        </HStack>
      ) : (
        <Spacer />
      )}
    </VStack>
  );
};

export default createWidget('SessionWidget', SessionWidget);
