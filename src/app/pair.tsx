import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEFAULT_PORT } from '@/lib/api';
import { Radius, Space, Type, usePalette, type Palette } from '@/lib/design';
import { ApiError, ping, parsePairingPayload, type Pairing } from '@/lib/api';
import { PrimaryButton } from '@/components/primary-button';
import { SegmentedControl } from '@/components/segmented-control';
import { usePairing } from '@/lib/pairing';

type Mode = 'scan' | 'manual';

const MODES = ['Scan QR', 'Enter manually'] as const;

export default function PairScreen() {
  const p = usePalette();
  const { save } = usePairing();
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<Mode>('scan');
  const [status, setStatus] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const handlingScan = useRef(false);

  const [host, setHost] = useState('');
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [token, setToken] = useState('');

  const params = useLocalSearchParams<{ host?: string; port?: string; token?: string }>();
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current) return;
    if (params.host && params.token) {
      deepLinkHandled.current = true;
      const portNum = parseInt(params.port ?? String(DEFAULT_PORT), 10);
      connect({ host: params.host, port: Number.isNaN(portNum) ? DEFAULT_PORT : portNum, token: params.token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.host, params.port, params.token]);

  async function connect(pairing: Pairing) {
    setConnecting(true);
    setStatus(null);
    try {
      await ping(pairing);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // `Stack.Protected` swaps this screen out for the tabs as soon as the
      // pairing is stored — an explicit navigation would race that and land on
      // a route that no longer exists.
      await save(pairing);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatus(e instanceof ApiError ? e.message : 'Could not connect.');
      handlingScan.current = false;
    } finally {
      setConnecting(false);
    }
  }

  function onScanned(data: string) {
    if (handlingScan.current || connecting) return;
    const parsed = parsePairingPayload(data);
    if (!parsed) {
      setStatus('That QR code is not a Claude Usage pairing code.');
      return;
    }
    handlingScan.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    connect(parsed);
  }

  function onManualConnect() {
    const portNum = parseInt(port, 10);
    if (!host.trim() || !token.trim() || Number.isNaN(portNum)) {
      setStatus('Enter the host, port, and token from your Mac.');
      return;
    }
    connect({ host: host.trim(), port: portNum, token: token.trim() });
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: p.bg }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: p.text }]}>Pair with your Mac</Text>
        <Text style={[styles.subtitle, { color: p.textSecondary }]}>
          In the Claude Usage menu bar app, open Settings → Mobile App and enable the companion server.
        </Text>

        <View style={styles.segmentWrap}>
          <SegmentedControl
            segments={MODES}
            value={mode === 'scan' ? 'Scan QR' : 'Enter manually'}
            onChange={(label) => {
              setMode(label === 'Scan QR' ? 'scan' : 'manual');
              setStatus(null);
              handlingScan.current = false;
            }}
          />
        </View>

        {mode === 'scan' ? (
          <View style={styles.scanArea}>
            {!permission ? (
              <ActivityIndicator color={p.accent} />
            ) : !permission.granted ? (
              <View style={styles.permWrap}>
                <Text style={[styles.permText, { color: p.textSecondary }]}>
                  Camera access lets you scan the pairing code shown on your Mac.
                </Text>
                <PrimaryButton title="Grant camera access" onPress={requestPermission} />
                <Pressable onPress={() => setMode('manual')} hitSlop={8}>
                  <Text style={[styles.linkText, { color: p.accent }]}>Enter details manually instead</Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.cameraWrap, { borderColor: p.border }]}>
                {/* The reticle and hint are white because they sit on a camera
                    feed. That feed is absent while the camera warms up — and
                    always absent on a simulator — so the frame carries its own
                    dark backdrop, or they render white on white. */}
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => onScanned(data)}
                />
                <Reticle color="#FFFDFA" />
                <Text style={styles.scanHint}>Point at the QR code</Text>
              </View>
            )}
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.manualArea}>
            <Field label="Host" value={host} onChangeText={setHost} placeholder="192.168.1.42" palette={p}
              keyboardType="numbers-and-punctuation" autoCapitalize="none" />
            <Field label="Port" value={port} onChangeText={setPort} placeholder="47600" palette={p}
              keyboardType="number-pad" />
            <Field label="Token" value={token} onChangeText={setToken} placeholder="paste token" palette={p}
              autoCapitalize="none" />
            <PrimaryButton
              title="Connect"
              onPress={onManualConnect}
              loading={connecting}
              style={{ marginTop: Space.sm }}
            />
          </KeyboardAvoidingView>
        )}

        {connecting && mode === 'scan' && (
          <View style={styles.connectingRow}>
            <ActivityIndicator color={p.accent} />
            <Text style={[styles.subtitle, { color: p.textSecondary, marginLeft: Space.sm, marginTop: 0 }]}>
              Connecting…
            </Text>
          </View>
        )}

        {status && <Text style={[styles.status, { color: p.critical }]}>{status}</Text>}
      </View>
    </SafeAreaView>
  );
}

function Reticle({ color }: { color: string }) {
  return (
    <View style={styles.reticleWrap} pointerEvents="none">
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <View key={c} style={[styles.corner, cornerStyle(c, color)]} />
      ))}
    </View>
  );
}

function cornerStyle(c: 'tl' | 'tr' | 'bl' | 'br', color: string) {
  const b = 4;
  const base = { borderColor: color };
  switch (c) {
    case 'tl': return { ...base, top: 0, left: 0, borderTopWidth: b, borderLeftWidth: b, borderTopLeftRadius: 10 };
    case 'tr': return { ...base, top: 0, right: 0, borderTopWidth: b, borderRightWidth: b, borderTopRightRadius: 10 };
    case 'bl': return { ...base, bottom: 0, left: 0, borderBottomWidth: b, borderLeftWidth: b, borderBottomLeftRadius: 10 };
    case 'br': return { ...base, bottom: 0, right: 0, borderBottomWidth: b, borderRightWidth: b, borderBottomRightRadius: 10 };
  }
}

function Field({
  label,
  palette,
  ...props
}: { label: string; palette: Palette } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: palette.textFaint }]}>{label}</Text>
      <TextInput
        style={[styles.input, { color: palette.text, backgroundColor: palette.surfaceSunken }]}
        placeholderTextColor={palette.textFaint}
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, padding: Space.xl },
  title: { fontSize: Type.title + 4, fontWeight: '800', marginTop: Space.sm, letterSpacing: -0.3 },
  subtitle: { fontSize: Type.body, lineHeight: 21, marginTop: Space.sm },

  segmentWrap: { marginTop: Space.xl },

  scanArea: { flex: 1, marginTop: Space.xl, alignItems: 'center', justifyContent: 'center' },
  permWrap: { alignItems: 'center', gap: Space.lg, paddingHorizontal: Space.lg },
  permText: { fontSize: Type.body, lineHeight: 21, textAlign: 'center' },
  cameraWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#15110E',
  },
  reticleWrap: { position: 'absolute', top: '16%', left: '16%', right: '16%', bottom: '16%' },
  corner: { position: 'absolute', width: 34, height: 34 },
  scanHint: { position: 'absolute', bottom: Space.lg, alignSelf: 'center', color: '#FFFDFA', fontSize: Type.label, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },

  manualArea: { marginTop: Space.xl },
  field: { marginBottom: Space.lg },
  fieldLabel: { fontSize: Type.caption, fontWeight: '700', marginBottom: Space.sm - 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderRadius: Radius.sm, paddingHorizontal: Space.lg - 2, paddingVertical: Space.md, fontSize: Type.metric },

  linkText: { fontSize: Type.label, fontWeight: '600' },

  connectingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Space.lg },
  status: { fontSize: Type.label, fontWeight: '600', textAlign: 'center', marginTop: Space.lg },
});
