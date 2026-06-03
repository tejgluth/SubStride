import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BaselineSummary, LongitudinalTrainingLoad, RunMetrics } from '@substride/analytics';
import type { BetaSessionRecord } from '../domain/betaAppModel';
import { labelForSurface, labelForWorkout } from '../domain/betaAppModel';
import { Ionicons } from '@expo/vector-icons';
import { Section } from '../components/Section';
import { CategoryScoreBar } from '../components/CategoryScoreBar';
import { colors, radius } from '../theme';

interface Props {
  metrics: RunMetrics;
  history: BetaSessionRecord[];
  baseline: BaselineSummary;
  longitudinalLoad: LongitudinalTrainingLoad;
}

const BASELINE_RUNS_NEEDED = 5;

function loadScore(metrics: RunMetrics): number {
  return metrics.totalTrainingLoad?.value.score0To100 ?? metrics.trainingStrain.value;
}

export function TrendsScreen({ metrics, history, baseline, longitudinalLoad }: Props) {
  const includedRuns = baseline.includedRunCount;
  const recentRuns = history.slice(-5);
  const timeline = longitudinalLoad.timeline.slice(-7);
  const riskValue = longitudinalLoad.riskSignal.value0To100;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Section title="Current training load" subtitle={`As of ${formatAsOf(longitudinalLoad.asOf)} · time-decayed across saved runs`}>
        <CategoryScoreBar
          label="Current Load"
          value={longitudinalLoad.currentLoadScore0To100}
          sublabel="7-day exponential load state from Total Training Load"
        />
        <View style={styles.loadStateGrid}>
          <LoadStateCard label="Mechanical ATL" value={longitudinalLoad.mechanical.acute} detail="7-day direct foot load" />
          <LoadStateCard label="Mechanical CTL" value={longitudinalLoad.mechanical.chronic} detail="42-day baseline load" />
          <LoadStateCard label="Balance" value={longitudinalLoad.total.balance} detail="CTL minus ATL" signed />
          <LoadStateCard label="28d tolerance" value={longitudinalLoad.total.tolerance28d} detail="Average daily load" />
        </View>
        <Text style={styles.loadNarrative}>
          {loadNarrative(longitudinalLoad)}
        </Text>
      </Section>

      <Section title="Weekly load signals" subtitle="Report-3 acute/chronic, monotony, and conservative risk signal">
        <CategoryScoreBar
          label="7-day monotony"
          value={longitudinalLoad.monotony7d * 100}
          sublabel="Higher means recent days look more similar, with less variation"
        />
        <CategoryScoreBar
          label="Weekly strain"
          value={Math.min(100, longitudinalLoad.trainingStrain7d)}
          sublabel={`${longitudinalLoad.trainingStrain7d.toFixed(1)} load units · weekly load x monotony`}
        />
        <CategoryScoreBar
          label="Risk signal"
          value={riskValue ?? 0}
          sublabel={riskValue == null ? 'Not shown until enough history exists' : `Transparent load-management cue · ${longitudinalLoad.riskSignal.level}`}
        />
        <Text style={styles.riskNote}>
          This is not an injury probability or diagnosis. It combines load spike, monotony,
          mechanical stress, asymmetry, fatigue drift, and pain context when available.
        </Text>
      </Section>

      {/* Baseline building status */}
      <Section title="Baseline status">
        <View style={styles.baselineCard}>
          <View style={styles.baselineIconRow}>
            <Ionicons name="analytics-outline" size={22} color={colors.brand} />
            <View style={styles.baselineText}>
              <Text style={styles.baselineTitle}>{baseline.status === 'preliminary' ? 'Building your baseline' : 'Baseline active'}</Text>
              <Text style={styles.baselineSubtitle}>{includedRuns} of {BASELINE_RUNS_NEEDED} similar runs toward stronger baseline comparison</Text>
            </View>
          </View>
          <View style={styles.baselineTrack}>
            <View style={[styles.baselineFill, { width: `${Math.min(100, (includedRuns / BASELINE_RUNS_NEEDED) * 100)}%` }]} />
          </View>
          <Text style={styles.baselineNote}>
            Baseline comparisons become available after {BASELINE_RUNS_NEEDED} similar runs (same shoe + surface).
            Sessions with high pain scores are excluded so they do not pollute normal-load comparisons.
          </Text>
        </View>
      </Section>

      {/* Current session snapshot for trends context */}
      <Section title="This session" subtitle="Reference for future trend comparison">
        <CategoryScoreBar label="Total Training Load" value={loadScore(metrics)} sublabel="Mechanical + perceived beta load" />
        <CategoryScoreBar label="Mechanical Load" value={metrics.mechanicalLoad.value.score0To100} sublabel="Pressure + IMU load" />
        <CategoryScoreBar label="Perceived Load" value={metrics.perceivedLoad.value.score0To100 ?? 0} sublabel={metrics.perceivedLoad.value.score0To100 == null ? "Not supplied" : "RPE-minutes"} />
        <CategoryScoreBar label="Load balance" value={metrics.categoryScores.loadBalance.value} sublabel="Medial/lateral symmetry" higherIsBetter />
        <CategoryScoreBar label="Impact load" value={metrics.categoryScores.impactLoad.value} sublabel="Impact proxy" />
        <CategoryScoreBar label="Fatigue shift" value={metrics.categoryScores.fatigueShift.value} sublabel="End-of-run load change" />
      </Section>

      <Section title="Shoe comparison">
        {history.length === 0 ? (
          <Placeholder
            icon="footsteps-outline"
            title="Save sessions to compare shoes"
            text="Shoe profiles are now stored with each session. Add or select shoes in Settings before saving runs."
          />
        ) : (
          recentRuns.map((record) => (
            <View key={record.session.id} style={styles.historyRow}>
              <View style={styles.historyMain}>
                <Text style={styles.historyTitle}>{record.label}</Text>
                <Text style={styles.historyMeta}>
                  {labelForSurface(record.context.surface)} · {labelForWorkout(record.context.workoutType)} · pain {record.context.painScore0To10}/10
                </Text>
              </View>
              <Text style={styles.historyScore}>{loadScore(record.metrics)}</Text>
            </View>
          ))
        )}
      </Section>

      <Section title="Surface & workout tags">
        <View style={styles.tagGrid}>
          {summarizeTags(history).map((tag) => (
            <View key={tag.label} style={styles.tagStat}>
              <Text style={styles.tagCount}>{tag.count}</Text>
              <Text style={styles.tagLabel}>{tag.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.tagNote}>
          Surface and workout tags are configured in Settings and saved with each session.
        </Text>
      </Section>

      <Section title="Training Load trend" subtitle="Decayed load at each saved run and at the current viewing time">
        <View style={styles.chartPlaceholder}>
          <View style={styles.chartBars}>
            {(timeline.length > 0 ? timeline.map((point) => point.currentLoadScore0To100) : [longitudinalLoad.currentLoadScore0To100]).map((v, i, arr) => {
              const isLast = i === arr.length - 1;
              return (
                <View key={i} style={styles.chartBarWrap}>
                  <Text style={[styles.chartVal, isLast && styles.chartValActive]}>{v}</Text>
                  <View
                    style={[
                      styles.chartBar,
                      { height: (v / 100) * 80 },
                      isLast && styles.chartBarActive,
                    ]}
                  />
                  <Text style={styles.chartRun}>{isLast ? 'Now' : `R${i + 1}`}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.chartNote}>
            Current Load decays with time. The same run contributes less after five days than it does two hours after finishing.
          </Text>
        </View>
      </Section>
    </ScrollView>
  );
}

function LoadStateCard({ label, value, detail, signed }: { label: string; value: number; detail: string; signed?: boolean }) {
  const display = signed && value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  return (
    <View style={styles.loadStateCard}>
      <Text style={styles.loadStateValue}>{display}</Text>
      <Text style={styles.loadStateLabel}>{label}</Text>
      <Text style={styles.loadStateDetail}>{detail}</Text>
    </View>
  );
}

function formatAsOf(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'now';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function loadNarrative(load: LongitudinalTrainingLoad): string {
  if (load.status === 'no_data') {
    return 'Save runs to build a timestamp-aware training load state.';
  }
  if (load.status === 'session_only') {
    return 'Session history is still too young for a confident rolling-load signal. Current Load is shown, but risk stays gated.';
  }
  const ratio = load.total.acuteChronicRatio;
  const ratioText = ratio == null ? 'not established yet' : `${ratio.toFixed(2)}x chronic`;
  return `Current Load is ${load.currentLoadScore0To100}/100. Acute load is ${ratioText}; status is ${load.status.replace('_', ' ')}.`;
}

function Placeholder({ icon, title, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }) {
  return (
    <View style={styles.placeholder}>
      <Ionicons name={icon} size={32} color={colors.textTertiary} style={styles.placeholderIcon} />
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderText}>{text}</Text>
    </View>
  );
}

function summarizeTags(history: BetaSessionRecord[]): Array<{ label: string; count: number }> {
  if (history.length === 0) {
    return [
      { label: 'No saved sessions', count: 0 },
    ];
  }
  const counts = new Map<string, number>();
  history.forEach((record) => {
    [labelForSurface(record.context.surface), labelForWorkout(record.context.workoutType)].forEach((label) => {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
  });
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

const styles = StyleSheet.create({
  baselineCard: { gap: 12 },
  baselineIconRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  baselineIcon: {},
  baselineText: { flex: 1 },
  baselineTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  baselineSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  baselineTrack: { height: 8, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  baselineFill: { height: '100%', backgroundColor: colors.brand, borderRadius: radius.full },
  baselineNote: { fontSize: 12, lineHeight: 17, color: colors.textTertiary },
  loadStateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  loadStateCard: { flexBasis: '48%', flexGrow: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.bgCardAlt, borderWidth: 1, borderColor: colors.border },
  loadStateValue: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  loadStateLabel: { marginTop: 2, fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  loadStateDetail: { marginTop: 2, fontSize: 10, color: colors.textTertiary, lineHeight: 14 },
  loadNarrative: { marginTop: 2, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  riskNote: { marginTop: 2, fontSize: 11, lineHeight: 16, color: colors.textTertiary },
  placeholder: { alignItems: 'center', padding: 20, gap: 10 },
  placeholderIcon: { marginBottom: 4 },
  placeholderTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  placeholderText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  historyMain: { flex: 1 },
  historyTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  historyMeta: { marginTop: 2, fontSize: 11, color: colors.textTertiary },
  historyScore: { width: 38, textAlign: 'right', fontSize: 20, fontWeight: '800', color: colors.brand },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tagStat: { minWidth: 88, flexGrow: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.bgCardAlt, borderWidth: 1, borderColor: colors.border },
  tagCount: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  tagLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', color: colors.textTertiary },
  tagNote: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  chartPlaceholder: { gap: 12 },
  chartBars: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 110 },
  chartBarWrap: { alignItems: 'center', gap: 5 },
  chartVal: { fontSize: 11, fontWeight: '700', color: colors.textTertiary },
  chartValActive: { color: colors.brand },
  chartBar: { width: 28, backgroundColor: colors.border, borderRadius: radius.sm },
  chartBarActive: { backgroundColor: colors.brand },
  chartRun: { fontSize: 10, color: colors.textTertiary, fontWeight: '600' },
  chartNote: { fontSize: 11, color: colors.textTertiary, lineHeight: 16, fontStyle: 'italic' },
});
