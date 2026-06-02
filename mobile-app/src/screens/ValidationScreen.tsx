import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CalibratedFrame, CalibrationProfile, RunMetrics } from '@substride/analytics';
import { Section } from '../components/Section';
import { MetricRow } from '../components/MetricRow';
import { CategoryScoreBar } from '../components/CategoryScoreBar';
import { SimBadge } from '../components/SimBadge';
import { colors, radius } from '../theme';

interface Props {
  metrics: RunMetrics;
  calibration: CalibrationProfile;
  frames: CalibratedFrame[];
}

export function ValidationScreen({ metrics, calibration, frames }: Props) {
  const durationMs = frames.length > 1
    ? frames[frames.length - 1].timestampMs - frames[0].timestampMs
    : 0;
  const sampleRateHz = durationMs > 0 ? ((frames.length - 1) / (durationMs / 1000)).toFixed(1) : '—';
  const qualityFrames = frames.filter((f) => f.qualityFlags.length === 0).length;
  const packetLossEst = (1 - qualityFrames / Math.max(1, frames.length));

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <SimBadge label="Developer / Validation mode" />
        <Text style={styles.warning}>
          This tab is for development and validation only. Data shown here is not intended for end-user display.
        </Text>
      </View>

      {/* Session quality */}
      <Section title="Session quality">
        <MetricRow label="Total frames" value={frames.length.toLocaleString()} />
        <MetricRow label="Duration" value={`${(durationMs / 1000).toFixed(1)} s`} />
        <MetricRow label="Sample rate estimate" value={`${sampleRateHz} Hz`} detail="Target: 100 Hz" />
        <MetricRow
          label="Quality frames"
          value={`${qualityFrames} / ${frames.length}`}
          detail="Frames with no quality flags"
        />
        <MetricRow
          label="Packet loss estimate"
          value={`${(packetLossEst * 100).toFixed(1)}%`}
          detail="Frames with quality flags / total"
        />
        <MetricRow label="Steps detected" value={`${metrics.steps.length}`} />
      </Section>

      {/* Calibration detail */}
      <Section title="Calibration detail">
        <MetricRow label="Profile ID" value={calibration.id} />
        <MetricRow label="Pod ID" value={calibration.podId} />
        <MetricRow label="Foot" value={calibration.foot} />
        <MetricRow label="Quality" value={calibration.quality.toUpperCase()} />
        <MetricRow label="Bad channels" value={`${calibration.badChannels.length}`} />
        <MetricRow label="Created" value={new Date(calibration.createdAt).toISOString().split('T')[0]} />
        {calibration.badChannels.length > 0 ? (
          <View style={styles.badChannels}>
            <Text style={styles.badChannelsTitle}>Bad channel findings:</Text>
            {calibration.badChannels.map((bc) => (
              <View key={bc.zoneIndex} style={styles.badChannelRow}>
                <Text style={styles.badChannelZone}>Zone {bc.zoneIndex + 1}</Text>
                <Text style={styles.badChannelCodes}>{bc.codes.join(', ')}</Text>
                <Text style={styles.badChannelSev}>{bc.severity}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Section>

      {/* Zone offsets */}
      <Section title="Calibration zone offsets" subtitle="Baseline offset per zone">
        <View style={styles.zoneGrid}>
          {calibration.zoneOffsets.map((offset, i) => (
            <View key={i} style={styles.zoneCell}>
              <Text style={styles.zoneCellLabel}>Z{i + 1}</Text>
              <Text style={styles.zoneCellVal}>{offset.toFixed(0)}</Text>
            </View>
          ))}
        </View>
      </Section>

      {/* All metrics raw */}
      <Section title="Raw metric values">
        <MetricRow label="Cadence" value={`${metrics.cadence.value.toFixed(2)} spm`} />
        <MetricRow label="Contact time" value={`${metrics.contactTime.value.toFixed(1)} ms`} />
        <MetricRow label="Total relative load" value={metrics.totalRelativeLoad.value.toFixed(0)} />
        <MetricRow label="Peak load (p95)" value={metrics.peakLoad.value.toFixed(2)} />
        <MetricRow label="Cumulative load" value={metrics.cumulativeLoad.value.toFixed(0)} />
        <MetricRow label="Load rate proxy" value={metrics.loadRateProxy.value.toFixed(2)} />
        <MetricRow label="Medial/lateral balance" value={`${metrics.medialLateralBalance.value.toFixed(1)}/100`} />
        <MetricRow label="Impact load" value={`${metrics.impactLoad.value.toFixed(3)}`} />
        <MetricRow label="Fatigue shift" value={`${metrics.fatigueShift.value.toFixed(2)} pp`} />
        <MetricRow label="Training Strain" value={`${metrics.trainingStrain.value}/100`} />
      </Section>

      {/* Category scores raw */}
      <Section title="Category score raw values">
        <CategoryScoreBar label="Load balance" value={metrics.categoryScores.loadBalance.value} />
        <CategoryScoreBar label="Impact load" value={metrics.categoryScores.impactLoad.value} />
        <CategoryScoreBar label="Forefoot/metatarsal" value={metrics.categoryScores.forefootMetatarsalLoad.value} />
        <CategoryScoreBar label="Heel load" value={metrics.categoryScores.heelLoad.value} />
        <CategoryScoreBar label="Arch/midfoot" value={metrics.categoryScores.archMidfootLoad.value} />
        <CategoryScoreBar label="Toe-off contribution" value={metrics.categoryScores.toeOffContribution.value} />
        <CategoryScoreBar label="Fatigue shift" value={metrics.categoryScores.fatigueShift.value} />
        <CategoryScoreBar label="Shoe load score" value={metrics.categoryScores.shoeLoadScore.value} />
      </Section>

      {/* Heel/mid/fore/toe distribution */}
      <Section title="Foot distribution (raw fractions)">
        {Object.entries(metrics.heelMidForeToeDistribution.value).map(([key, val]) => (
          <MetricRow key={key} label={key} value={`${(val * 100).toFixed(2)}%`} />
        ))}
      </Section>

      <View style={styles.exportNote}>
        <Text style={styles.exportNoteTitle}>Export</Text>
        <Text style={styles.exportNoteText}>
          Full session export (frames + calibration + metrics) available via Settings &gt; Export.
          Use for offline validation against expected patterns.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 12, gap: 8 },
  warning: { fontSize: 12, color: colors.textTertiary, lineHeight: 17, padding: 10, backgroundColor: colors.warningLight, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warningBorder },
  badChannels: { marginTop: 10, padding: 10, backgroundColor: colors.errorLight, borderRadius: radius.md, gap: 6 },
  badChannelsTitle: { fontSize: 12, fontWeight: '700', color: colors.error, marginBottom: 4 },
  badChannelRow: { flexDirection: 'row', gap: 8 },
  badChannelZone: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, width: 50 },
  badChannelCodes: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  badChannelSev: { fontSize: 12, fontWeight: '700', color: colors.error },
  zoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  zoneCell: { width: 52, padding: 6, backgroundColor: colors.bgCardAlt, borderRadius: radius.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  zoneCellLabel: { fontSize: 9, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' },
  zoneCellVal: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  exportNote: { marginBottom: 20, padding: 14, backgroundColor: colors.bgCardAlt, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 6 },
  exportNoteTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  exportNoteText: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
});
