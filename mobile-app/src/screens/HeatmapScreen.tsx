import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CalibratedFrame } from '@substride/analytics';
import { zoneMap } from '@substride/analytics';
import { Section } from '../components/Section';
import { FootHeatmap } from '../components/FootHeatmap';
import { colors, heatColor, radius } from '../theme';

type LoadMode = 'cumulative' | 'peak';

interface Props {
  frames: CalibratedFrame[];
}

function summarizeFrames(frames: CalibratedFrame[]) {
  const sums = new Array(16).fill(0);
  const maxPerZone = new Array(16).fill(0);

  for (const frame of frames) {
    frame.relativeLoad.forEach((v, i) => {
      sums[i] += v;
      if (v > maxPerZone[i]) maxPerZone[i] = v;
    });
  }

  return {
    sampleCount: frames.length,
    averages: sums.map((s) => s / Math.max(1, frames.length)),
    peaks: maxPerZone,
  };
}

export function HeatmapScreen({ frames }: Props) {
  const [mode, setMode] = useState<LoadMode>('cumulative');
  const [showNames, setShowNames] = useState(false);

  const { combined, left, right } = useMemo(() => {
    const leftFrames = frames.filter((frame) => frame.foot === 'left');
    const rightFrames = frames.filter((frame) => frame.foot === 'right');

    return {
      combined: summarizeFrames(frames),
      left: summarizeFrames(leftFrames),
      right: summarizeFrames(rightFrames),
    };
  }, [frames]);

  const displayValues = mode === 'cumulative' ? combined.averages : combined.peaks;
  const leftValues = mode === 'cumulative' ? left.averages : left.peaks;
  const rightValues = mode === 'cumulative' ? right.averages : right.peaks;
  const heatmapMax = Math.max(...leftValues, ...rightValues, 1);
  const totalLoad = displayValues.reduce((a, b) => a + b, 0);

  const regionSummary = useMemo(() => {
    const regions: Record<string, number> = { heel: 0, midfoot: 0, forefoot: 0, toe: 0 };
    zoneMap.forEach((z, i) => { regions[z.region] += displayValues[i]; });
    const total = Object.values(regions).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(regions).map(([key, val]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      pct: (val / total) * 100,
    }));
  }, [displayValues]);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Mode toggles */}
      <View style={styles.toggleRow}>
        {(['cumulative', 'peak'] as LoadMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.toggleBtn, mode === m && styles.toggleActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
              {m === 'cumulative' ? 'Cumulative load' : 'Peak load'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Section title="Pressure heatmap" subtitle="16-zone relative load · not calibrated kPa">
        <View style={styles.heatmapPair}>
          <FootHeatmap
            zoneAverages={leftValues}
            foot="left"
            label="Left foot"
            maxIntensity={heatmapMax}
            sampleCount={left.sampleCount}
            showZoneNames={showNames}
          />
          <FootHeatmap
            zoneAverages={rightValues}
            foot="right"
            label="Right foot"
            maxIntensity={heatmapMax}
            sampleCount={right.sampleCount}
            showZoneNames={showNames}
          />
        </View>
        <View style={styles.legend}>
          <Text style={styles.legendText}>Low</Text>
          <View style={styles.legendBar}>
            {[0, 0.16, 0.33, 0.5, 0.66, 0.83, 1].map((t) => (
              <View key={t} style={[styles.legendSeg, { backgroundColor: heatColor(t) }]} />
            ))}
          </View>
          <Text style={styles.legendText}>High</Text>
        </View>
        <TouchableOpacity style={styles.namesBtn} onPress={() => setShowNames(!showNames)}>
          <Text style={styles.namesBtnText}>{showNames ? 'Hide zone numbers' : 'Show zone numbers'}</Text>
        </TouchableOpacity>
      </Section>

      {/* Region breakdown */}
      <Section title="Load by region">
        {regionSummary.map(({ key, label, pct }) => (
          <View key={key} style={styles.regionRow}>
            <Text style={styles.regionLabel}>{label}</Text>
            <View style={styles.regionTrack}>
              <View style={[styles.regionFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.regionPct}>{pct.toFixed(1)}%</Text>
          </View>
        ))}
        <Text style={styles.note}>
          Relative fractions only — not validated pressure measurements.
        </Text>
      </Section>

      {/* Zone details */}
      <Section title="Zone table" subtitle="Tap mode to switch between average and peak">
        {zoneMap.map((zone, i) => {
          const val = displayValues[i];
          const pct = totalLoad > 0 ? ((val / totalLoad) * 100).toFixed(1) : '0.0';
          return (
            <View key={zone.id} style={styles.zoneRow}>
              <View style={[styles.zoneNum, { backgroundColor: colors.brandLight }]}>
                <Text style={styles.zoneNumText}>{i + 1}</Text>
              </View>
              <View style={styles.zoneInfo}>
                <Text style={styles.zoneName}>{zone.displayName}</Text>
                <Text style={styles.zoneTech}>{zone.region} · {zone.side}</Text>
              </View>
              <Text style={styles.zoneVal}>{pct}%</Text>
            </View>
          );
        })}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  toggleActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandLight,
  },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
  toggleTextActive: { color: colors.brand },
  heatmapPair: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 10,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  legendText: { fontSize: 10, color: colors.textTertiary, fontWeight: '700' },
  legendBar: { flexDirection: 'row', height: 9, borderRadius: radius.full, overflow: 'hidden', flex: 1 },
  legendSeg: { flex: 1 },
  namesBtn: { marginTop: 12, alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  namesBtnText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  regionLabel: { width: 72, fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  regionTrack: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  regionFill: { height: '100%', backgroundColor: colors.brand, borderRadius: radius.full },
  regionPct: { width: 40, fontSize: 12, fontWeight: '700', color: colors.textPrimary, textAlign: 'right' },
  note: { marginTop: 6, fontSize: 11, color: colors.textTertiary, lineHeight: 16 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  zoneNum: { width: 26, height: 26, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  zoneNumText: { fontSize: 11, fontWeight: '800', color: colors.brand },
  zoneInfo: { flex: 1 },
  zoneName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  zoneTech: { fontSize: 11, color: colors.textTertiary, textTransform: 'capitalize' },
  zoneVal: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
});
