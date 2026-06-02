import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { connectionSummary, type BetaPod, type BetaPodConnection } from '../domain/betaAppModel';
import { podBleService, type PodScanResult } from '../services/podBleService';
import { colors, radius } from '../theme';

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

interface Props {
  pods: BetaPod[];
  onSetConnection: (podId: string, connection: BetaPodConnection) => void;
  onSyncSession: () => void;
}

const FOOT_COLORS: Record<string, string> = {
  left: colors.brand,
  right: colors.success,
  unassigned: colors.textTertiary,
};

function SignalBar({ rssi }: { rssi?: number }) {
  if (rssi === undefined) return <Text style={styles.noSignal}>— dBm</Text>;
  const bars = rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <View style={styles.signalRow}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.signalBar,
            { height: 4 + i * 3, backgroundColor: i <= bars ? colors.brand : colors.border },
          ]}
        />
      ))}
      <Text style={styles.rssiText}>{rssi} dBm</Text>
    </View>
  );
}

export function PairingScreen({ pods, onSetConnection, onSyncSession }: Props) {
  const [scanResults, setScanResults] = useState<PodScanResult[]>([]);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const summary = useMemo(() => connectionSummary(pods), [pods]);

  const scan = async () => {
    setScanState('scanning');
    try {
      const results = await podBleService.scanForPods();
      setScanResults(results);
      setScanState('done');
    } catch {
      setScanState('error');
    }
  };

  useEffect(() => { scan(); }, []);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Section title="Pod connection">
        <View style={styles.overview}>
          <View style={styles.overviewItem}>
            <Text style={[styles.overviewNum, summary.leftConnected && styles.connectedNum]}>
              {summary.leftConnected ? 'On' : 'Off'}
            </Text>
            <Text style={styles.overviewLabel}>Left pod</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={[styles.overviewNum, summary.rightConnected && styles.connectedNum]}>
              {summary.rightConnected ? 'On' : 'Off'}
            </Text>
            <Text style={styles.overviewLabel}>Right pod</Text>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewItem}>
            <Text style={styles.overviewNum}>{summary.connectedCount}</Text>
            <Text style={styles.overviewLabel}>Tracking</Text>
          </View>
        </View>
        {summary.mode === 'one_pod' ? (
          <Text style={styles.modeNote}>One-pod mode is valid. The missing foot will show as no data and left/right comparison metrics will be unavailable.</Text>
        ) : summary.mode === 'no_pods' ? (
          <Text style={styles.modeWarn}>No pods connected. The app will use simulator fallback data for screen testing.</Text>
        ) : (
          <Text style={styles.modeGood}>Both pods are connected for full left/right pressure comparison.</Text>
        )}
      </Section>

      <Section title="Bluetooth scan">
        <View style={styles.scanRow}>
          <View style={styles.scanStatus}>
            {scanState === 'scanning' ? (
              <Text style={styles.scanning}>Scanning for SubStride pods...</Text>
            ) : scanState === 'done' ? (
              <Text style={styles.scanDone}>
                {scanResults.length > 0 ? `Found ${scanResults.length} pod${scanResults.length > 1 ? 's' : ''}` : 'No pods found'}
              </Text>
            ) : scanState === 'error' ? (
              <Text style={styles.scanError}>Scan failed. Check Bluetooth permissions.</Text>
            ) : (
              <Text style={styles.scanIdle}>Ready to scan</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.scanBtn, scanState === 'scanning' && styles.scanBtnDisabled]}
            onPress={scan}
            disabled={scanState === 'scanning'}
          >
            <Text style={styles.scanBtnText}>{scanState === 'scanning' ? '...' : 'Scan'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.scanNote}>
          Simulator results mirror the expected BLE flow. Real pods should advertise as SubStride-Pod-XXXX.
        </Text>
      </Section>

      <Section title="Configured pods">
        {pods.map((pod) => {
          const connected = pod.connection === 'connected';
          return (
            <View key={pod.id} style={styles.podCard}>
              <View style={[styles.podFootBadge, { backgroundColor: FOOT_COLORS[pod.assignedFoot] }]}>
                <Text style={styles.podFootText}>{pod.assignedFoot.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.podInfo}>
                <View style={styles.podNameRow}>
                  <Text style={styles.podName}>{pod.nickname ?? pod.serialNumber}</Text>
                  <StatusBadge status={connected ? 'pass' : 'warn'} />
                </View>
                <Text style={styles.podMeta}>{pod.id} · {pod.firmwareVersion}</Text>
                <SignalBar rssi={pod.rssi} />
              </View>
              <TouchableOpacity
                style={[styles.podAction, connected && styles.podActionConnected]}
                onPress={() => onSetConnection(pod.id, connected ? 'disconnected' : 'connected')}
              >
                <Text style={[styles.podActionText, connected && styles.podActionTextConnected]}>
                  {connected ? 'Disconnect' : 'Connect'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </Section>

      <Section title="Session sync">
        <Text style={styles.copy}>
          Pods can record standalone during a run. When hardware is ready, this screen will import the pod log,
          decode pressure frames, and attach shoe, surface, workout, pain, and effort context.
        </Text>
        <TouchableOpacity style={styles.syncBtn} onPress={onSyncSession} activeOpacity={0.8}>
          <Text style={styles.syncBtnText}>Simulate session sync</Text>
        </TouchableOpacity>
      </Section>

      <Section title="Run flow">
        <View style={styles.steps}>
          {[
            ['1', 'Connect left and/or right pod'],
            ['2', 'Select shoe and post-run context in Settings'],
            ['3', 'Record run on pod hardware'],
            ['4', 'Sync session into SubStride'],
            ['5', 'Review heatmap, strain, trends, and insights'],
          ].map(([n, text]) => (
            <View key={n} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{n}</Text>
              </View>
              <Text style={styles.stepText}>{text}</Text>
            </View>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  overview: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  overviewItem: { alignItems: 'center', gap: 4, flex: 1 },
  overviewNum: { fontSize: 24, fontWeight: '800', color: colors.textTertiary },
  connectedNum: { color: colors.success },
  overviewLabel: { fontSize: 10, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  overviewDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  modeNote: { marginTop: 10, fontSize: 12, lineHeight: 17, color: colors.warning },
  modeWarn: { marginTop: 10, fontSize: 12, lineHeight: 17, color: colors.error },
  modeGood: { marginTop: 10, fontSize: 12, lineHeight: 17, color: colors.success, fontWeight: '700' },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  scanStatus: { flex: 1 },
  scanning: { fontSize: 14, color: colors.brand, fontWeight: '600' },
  scanDone: { fontSize: 14, color: colors.success, fontWeight: '600' },
  scanError: { fontSize: 14, color: colors.error, fontWeight: '600' },
  scanIdle: { fontSize: 14, color: colors.textSecondary },
  scanBtn: { paddingHorizontal: 18, paddingVertical: 9, backgroundColor: colors.brand, borderRadius: radius.md },
  scanBtnDisabled: { backgroundColor: colors.border },
  scanBtnText: { fontSize: 14, fontWeight: '700', color: colors.textInverse },
  scanNote: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  podCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  podFootBadge: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  podFootText: { fontSize: 18, fontWeight: '800', color: colors.textInverse },
  podInfo: { flex: 1, gap: 3 },
  podNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  podName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  podMeta: { fontSize: 11, color: colors.textTertiary },
  podAction: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandBorder, backgroundColor: colors.brandLight },
  podActionConnected: { borderColor: colors.errorBorder, backgroundColor: colors.errorLight },
  podActionText: { fontSize: 12, fontWeight: '800', color: colors.brand },
  podActionTextConnected: { color: colors.error },
  signalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: 2 },
  signalBar: { width: 4, borderRadius: 2 },
  rssiText: { fontSize: 11, color: colors.textTertiary, marginLeft: 4 },
  noSignal: { fontSize: 11, color: colors.textTertiary },
  copy: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginBottom: 14 },
  syncBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.brand },
  syncBtnText: { fontSize: 13, fontWeight: '800', color: colors.textInverse },
  steps: { gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandLight, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  stepNumText: { fontSize: 12, fontWeight: '800', color: colors.brand },
  stepText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },
});
