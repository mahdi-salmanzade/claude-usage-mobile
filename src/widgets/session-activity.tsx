import { Gauge, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type SessionActivityProps = {
  sessionPctText: string; // "76%"
  sessionFraction: number; // 0..1
  sessionReset: string; // "1h 40m left"
  sessionTokens: string; // "168K / 220K"
  weeklyText: string; // "Week 61%"
  modelsText: string; // "Opus 48% · Sonnet 41%"
  accent: string; // status color hex
};

const SessionActivity = (props: SessionActivityProps, _environment: LiveActivityEnvironment) => {
  'widget';

  const accent = props.accent;
  const faint = '#8A8A8A';

  return {
    banner: (
      <HStack spacing={14} modifiers={[padding({ all: 14 })]}>
        <Gauge
          value={props.sessionFraction}
          modifiers={[foregroundStyle(accent)]}
          currentValueLabel={<Text modifiers={[font({ size: 14, weight: 'bold' })]}>{props.sessionPctText}</Text>}
        />
        <VStack alignment="leading" spacing={3}>
          <Text modifiers={[font({ weight: 'bold' })]}>Claude session</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(faint)]}>
            {props.sessionTokens} · {props.sessionReset}
          </Text>
          <Text modifiers={[font({ size: 12 })]}>
            {props.weeklyText} · {props.modelsText}
          </Text>
        </VStack>
      </HStack>
    ),
    compactLeading: <Image systemName="gauge.medium" color={accent} />,
    compactTrailing: <Text modifiers={[font({ weight: 'semibold' })]}>{props.sessionPctText}</Text>,
    minimal: <Text modifiers={[font({ weight: 'bold' }), foregroundStyle(accent)]}>{props.sessionPctText}</Text>,
    expandedLeading: (
      <VStack alignment="leading" modifiers={[padding({ all: 8 })]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(faint)]}>Session</Text>
        <Text modifiers={[font({ size: 22, weight: 'bold' }), foregroundStyle(accent)]}>{props.sessionPctText}</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(faint)]}>{props.sessionTokens}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" modifiers={[padding({ all: 8 })]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(faint)]}>Resets</Text>
        <Text modifiers={[font({ size: 14, weight: 'semibold' })]}>{props.sessionReset}</Text>
      </VStack>
    ),
    expandedBottom: (
      <HStack modifiers={[padding({ all: 8 })]}>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(faint)]}>{props.weeklyText}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 12 }), foregroundStyle(faint)]}>{props.modelsText}</Text>
      </HStack>
    ),
  };
};

export default createLiveActivity('SessionActivity', SessionActivity);
