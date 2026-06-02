import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { scoreCategory } from '@substride/analytics';
import type { BetaRunComputation } from '../domain/betaAppModel';
import { connectionSummary, labelForSurface, labelForWorkout } from '../domain/betaAppModel';
import { Section } from '../components/Section';
import { MetricRow } from '../components/MetricRow';
import { ScoreRing } from '../components/ScoreRing';
import { CategoryScoreBar } from '../components/CategoryScoreBar';
import { SimBadge } from '../components/SimBadge';
import { colors, radius } from '../theme';

interface Props {
  computed: BetaRunComputation;
  isRunning: boolean;
  onStartRun: () => void;
  onEndRun: () => void;
}

const DISTRIBUTION_LABELS: Record<string, string> = {
  heel: 'Heel',
  midfoot: 'Midfoot',
  forefoot: 'Forefoot',
  toe: 'Toe',
};

export function RunSummaryScreen({ computed, isRunning, onStartRun, onEndRun }: Props) {
  const { session, metrics, explanation, context, activeShoe, baseline } = computed;
  const category = scoreCategory(metrics.trainingStrain.value);
  const dist = metrics.heelMidForeToeDistribution.value;
  const podSummary = connectionSummary(computed.connectedPods);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Sim indicator */}
      <View style={styles.simRow}>
        <SimBadge label={session.label} />
      </View>

      <Section title="Ready to run">
        <View style={styles.readyGrid}>
          <View style={styles.readyItem}>
            <Text style={styles.readyValue}>{podSummary.mode === 'two_pods' ? '2 pods' : podSummary.mode === 'one_pod' ? '1 pod' : 'Sim'}</Text>
            <Text style={styles.readyLabel}>Tracking</Text>
          </View>
          <View style={styles.readyItem}>
            <Text style={styles.readyValue}>{activeShoe?.name ?? 'No shoe'}</Text>
            <Text style={styles.readyLabel}>Shoe</Text>
          </View>
          <View style={styles.readyItem}>
            <Text style={styles.readyValue}>{labelForSurface(context.surface)}</Text>
            <Text style={styles.readyLabel}>Surface</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, isRunning && styles.endBtn]}
          onPress={isRunning ? onEndRun : onStartRun}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{isRunning ? 'End run' : 'Start run'}</Text>
        </TouchableOpacity>
        <Text style={styles.runFlowNote}>
          {isRunning ? 'Recording command sent to connected pods. Ending the run opens post-run questions.' : 'Start sends the recording command to connected pods, or uses simulator mode for this prototype.'}
        </Text>
      </Section>

      {/* Hero: Training Strain */}
      <Section>
        <View style={styles.heroContent}>
          <ScoreRing score={metrics.trainingStrain.value} category={category} size={128} />
          <View style={styles.heroDivider} />
          <View style={styles.heroRight}>
            <Text style={styles.explanationText}>{explanation}</Text>
          </View>
        </View>
      </Section>

      {/* Key run metrics */}
      <Section title="Run metrics">
        <MetricRow
          label="Cadence"
          value={`${metrics.cadence.value.toFixed(1)} spm`}
          detail="Steps per minute (estimated)"
        />
        <MetricRow
          label="Ground contact"
          value={`${metrics.contactTime.value.toFixed(0)} ms`}
          detail="Load-threshold contact window estimate"
        />
        <MetricRow
          label="Peak load"
          value={metrics.peakLoad.value.toFixed(0)}
          detail="95th percentile · relative units"
        />
        <MetricRow
          label="Fatigue shift"
          value={`${metrics.fatigueShift.value.toFixed(1)}%`}
          detail="Forefoot load change: first half vs. second half"
        />
        <MetricRow
          label="Medial/lateral balance"
          value={`${metrics.medialLateralBalance.value.toFixed(0)}/100`}
          detail="Higher is more balanced"
        />
      </Section>

      {/* Category scores */}
      <Section title="Category scores" subtitle="Relative load indicators — not medical measurements">
        <CategoryScoreBar label="Load balance" value={metrics.categoryScores.loadBalance.value} sublabel="Medial vs. lateral relative load" />
        <CategoryScoreBar label="Impact load" value={metrics.categoryScores.impactLoad.value} sublabel="Pressure + IMU impact proxy" />
        <CategoryScoreBar label="Forefoot / metatarsal" value={metrics.categoryScores.forefootMetatarsalLoad.value} sublabel="Forefoot zone load fraction" />
        <CategoryScoreBar label="Heel load" value={metrics.categoryScores.heelLoad.value} sublabel="Heel zone load fraction" />
        <CategoryScoreBar label="Arch / midfoot" value={metrics.categoryScores.archMidfootLoad.value} sublabel="Midfoot zone load fraction" />
        <CategoryScoreBar label="Toe-off contribution" value={metrics.categoryScores.toeOffContribution.value} sublabel="Toe zone during late stance" />
        <CategoryScoreBar label="Fatigue proxy" value={metrics.categoryScores.fatigueShift.value} sublabel="Forefoot load shift over run" />
      </Section>

      {/* Load distribution */}
      <Section title="Foot load distribution">
        <View style={styles.distRow}>
          {Object.entries(dist).map(([key, val]) => (
            <View key={key} style={styles.distCell}>
              <Text style={styles.distPct}>{(val * 100).toFixed(0)}%</Text>
              <View style={[styles.distBar, { height: Math.max(4, val * 80) }]} />
              <Text style={styles.distLabel}>{DISTRIBUTION_LABELS[key] ?? key}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.distNote}>
          Relative fraction of total load by region. Not validated kPa or Newtons.
        </Text>
      </Section>

      {/* Post-run context */}
      <Section title="Session context">
        <MetricRow label="Source" value="Simulator" detail="Uses the same analytics path as imported pod data" />
        <MetricRow label="Shoe" value={activeShoe?.name ?? 'No shoe selected'} />
        <MetricRow label="Surface" value={labelForSurface(context.surface)} />
        <MetricRow label="Workout" value={labelForWorkout(context.workoutType)} />
        <MetricRow label="Pain" value={`${context.painScore0To10}/10`} detail="Saved with session for baseline filtering" />
        <MetricRow label="Effort" value={`${context.perceivedEffort0To10}/10`} />
        <MetricRow label="Baseline" value={baseline.status.replace('_', ' ')} detail={`${baseline.includedRunCount} similar run${baseline.includedRunCount === 1 ? '' : 's'} included`} />
        <MetricRow label="Frames" value={`${computed.frames.length.toLocaleString()}`} detail="Calibrated pressure frames" />
        <MetricRow label="Steps detected" value={`${metrics.steps.length}`} detail="Gait events segmented" />
      </Section>

      {/* Limitations notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          These are experimental beta indicators. Training Strain reflects relative load and gait patterns
          compared to personal baseline when available. These metrics are not medical-grade measurements
          and should not be used as clinical guidance. Consult a professional for persistent pain or injury concern.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  simRow: { marginBottom: 10 },
  readyGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  readyItem: { flex: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.bgCardAlt, borderWidth: 1, borderColor: colors.border },
  readyValue: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  readyLabel: { marginTop: 3, fontSize: 10, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  saveBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.brand },
  endBtn: { backgroundColor: colors.error },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: colors.textInverse },
  runFlowNote: { marginTop: 8, fontSize: 11, lineHeight: 16, color: colors.textTertiary, textAlign: 'center' },
  heroContent: { gap: 20 },
  heroDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderLight },
  heroRight: { gap: 10 },
  explanationText: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  distRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 110, marginBottom: 12 },
  distCell: { alignItems: 'center', gap: 6, flex: 1 },
  distPct: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  distBar: { width: 28, backgroundColor: colors.brand, borderRadius: radius.sm, marginBottom: 4 },
  distLabel: { fontSize: 10, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3 },
  distNote: { fontSize: 11, color: colors.textTertiary, lineHeight: 16 },
  notice: {
    marginBottom: 20,
    padding: 14,
    backgroundColor: colors.bgCardAlt,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  noticeText: { fontSize: 12, color: colors.textTertiary, lineHeight: 18 },
});
