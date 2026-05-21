import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { useTheme } from '@/hooks/use-theme';
import { ApiError, ping, parsePairingPayload, type Pairing } from '@/lib/api';
import { usePairing } from '@/lib/pairing';

type Mode = 'scan' | 'manual';

export default function PairScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { save } = usePairing();
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<Mode>('scan');
  const [status, setStatus] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const handlingScan = useRef(false);

  // Manual entry fields
  const [host, setHost] = useState('');
  const [port, setPort] = useState('47600');
  const [token, setToken] = useState('');

  // Deep-link pairing: claudeusagemobile://pair?host=..&port=..&token=..
  const params = useLocalSearchParams<{ host?: string; port?: string; token?: string }>();
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current) return;
    if (params.host && params.token) {
      deepLinkHandled.current = true;
      const portNum = parseInt(params.port ?? '47600', 10);
      connect({ host: params.host, port: Number.isNaN(portNum) ? 47600 : portNum, token: params.token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.host, params.port, params.token]);

  async function connect(pairing: Pairing) {
    setConnecting(true);
    setStatus(null);
    try {
      await ping(pairing);
      await save(pairing);
      router.replace('/');
    } catch (e) {
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
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Pair with your Mac</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          In the Claude Usage menu bar app, open Settings → Mobile App and enable the companion server.
        </Text>

        <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
          {(['scan', 'manual'] as Mode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.segmentItem, mode === m && { backgroundColor: theme.backgroundSelected }]}
              onPress={() => {
                setMode(m);
                setStatus(null);
                handlingScan.current = false;
              }}>
              <Text style={[styles.segmentText, { color: theme.text }]}>{m === 'scan' ? 'Scan QR' : 'Enter manually'}</Text>
            </Pressable>
          ))}
        </View>

        {mode === 'scan' ? (
          <View style={styles.scanArea}>
            {!permission ? (
              <ActivityIndicator />
            ) : !permission.granted ? (
              <View style={styles.center}>
                <Text style={[styles.subtitle, { color: theme.textSecondary, textAlign: 'center' }]}>
                  Camera access is needed to scan the pairing code.
                </Text>
                <Pressable style={[styles.button, { backgroundColor: '#0A84FF' }]} onPress={requestPermission}>
                  <Text style={styles.buttonText}>Grant camera access</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.cameraWrap}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => onScanned(data)}
                />
                <View style={styles.reticle} pointerEvents="none" />
              </View>
            )}
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.manualArea}>
            <Field label="Host" value={host} onChangeText={setHost} placeholder="192.168.1.42" theme={theme}
              keyboardType="numbers-and-punctuation" autoCapitalize="none" />
            <Field label="Port" value={port} onChangeText={setPort} placeholder="47600" theme={theme}
              keyboardType="number-pad" />
            <Field label="Token" value={token} onChangeText={setToken} placeholder="paste token" theme={theme}
              autoCapitalize="none" />
            <Pressable
              style={[styles.button, { backgroundColor: '#0A84FF', opacity: connecting ? 0.6 : 1 }]}
              onPress={onManualConnect}
              disabled={connecting}>
              {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Connect</Text>}
            </Pressable>
          </KeyboardAvoidingView>
        )}

        {connecting && mode === 'scan' && (
          <View style={styles.connectingRow}>
            <ActivityIndicator />
            <Text style={[styles.subtitle, { color: theme.textSecondary, marginLeft: 8 }]}>Connecting…</Text>
          </View>
        )}

        {status && <Text style={[styles.status, { color: '#FF453A' }]}>{status}</Text>}
      </View>
    </SafeAreaView>
  );
}

function Field({
  label,
  theme,
  ...props
}: { label: string; theme: ReturnType<typeof useTheme> } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholderTextColor={theme.textSecondary}
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, padding: 20 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3, marginTop: 20 },
  segmentItem: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  scanArea: { flex: 1, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  cameraWrap: { width: '100%', aspectRatio: 1, borderRadius: 20, overflow: 'hidden' },
  reticle: {
    position: 'absolute',
    top: '15%',
    left: '15%',
    right: '15%',
    bottom: '15%',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
  },
  manualArea: { marginTop: 24 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  connectingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  status: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 16 },
});
