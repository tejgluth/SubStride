import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BaselineSummary, LongitudinalTrainingLoad, RunMetrics, ShoeProfile } from '@substride/analytics';
import type { BetaSessionRecord } from '../domain/betaAppModel';
import { labelForSurface, labelForWorkout } from '../domain/betaAppModel';
import { buildShoeScores } from '../domain/shoeComparison';
import { Ionicons } from '@expo/vector-icons';
import { Section } from '../components/Section';
import { CategoryScoreBar } from '../components/CategoryScoreBar';
import { colors, radius } from '../theme';

interface Props {
  metrics: RunMetrics;
  history: BetaSessionRecord[];
  shoes: ShoeProfile[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  baseline: BaselineSummary;
  longitudinalLoad: LongitudinalTrainingLoad;
}

const BASELINE_RUNS_NEEDED = 5;

function loadScore(metrics: RunMetrics): number {
  return metrics.totalTrainingLoad?.value.score0To100 ?? metrics.trainingStrain.value;
}

export function TrendsScreen({
  metrics,
  history,
  shoes,
  selectedSessionId,
  onSelectSession,
  baseline,
  longitudinalLoad,
}: Props) {
  const includedRuns = baseline.includedRunCount;
  const selectedRecord = history.find((record) => record.session.id === selectedSessionId) ?? history[history.length - 1] ?? null;
  const sessionMetrics = selectedRecord?.metrics ?? metrics;
  const timeline = longitudinalLoad.timeline.slice(-7);
  const riskValue = longitudinalLoad.riskSignal.value0To100;
  const shoeScores = useMemo(() => buildShoeScores(history, shoes), [history, shoes]);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Section title="Current training load" subtitle={`As of ${formatAsOf(longitudinalLoad.asOf)} · time-decayed across saved runs`}>
        <CategoryScoreBar
          label="Current Training Load"
          value={longitudinalLoad.currentLoadScore0To100}
          sublabel="7-day time-decayed state from saved Total Session Load"
        />
        <View style={styles.loadStateGrid}>
          <LoadStateCard label="Mechanical Current Load" value={longitudinalLoad.mechanical.acute} detail="Recent 7-day direct foot load" />
          <LoadStateCard label="Mechanical Baseline Load" value={longitudinalLoad.mechanical.chronic} detail="Longer 42-day load baseline" />
          <LoadStateCard label="Training Balance" value={longitudinalLoad.total.balance} detail="Baseline load minus current load" signed />
          <LoadStateCard label="28-day Load Tolerance" value={longitudinalLoad.total.tolerance28d} detail="Average daily load state" />
        </View>
        <Text style={styles.loadNarrative}>
          {loadNarrative(longitudinalLoad)}
        </Text>
      </Section>

      <Section title="Weekly load signals" subtitle="Recent load, baseline load, monotony, and conservative risk signal">
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
        {riskValue == null ? (
          <RiskGateCard text={riskRequirementText(longitudinalLoad)} />
        ) : (
          <CategoryScoreBar
            label="Risk signal"
            value={riskValue}
            sublabel={`Transparent load-management cue · ${longitudinalLoad.riskSignal.level}`}
          />
        )}
        <Text style={styles.riskNote}>
          This risk signal is implemented, but it is not an injury probability or diagnosis.
          It combines load spike, monotony, mechanical stress, asymmetry, fatigue drift, and pain context when available.
        </Text>
      </Section>

      {includedRuns < BASELINE_RUNS_NEEDED ? (
        <Section title="Baseline status">
          <View style={styles.baselineCard}>
            <View style={styles.baselineIconRow}>
              <Ionicons name="analytics-outline" size={22} color={colors.brand} />
              <View style={styles.baselineText}>
                <Text style={styles.baselineTitle}>Building your baseline</Text>
                <Text style={styles.baselineSubtitle}>
                  {Math.min(includedRuns, BASELINE_RUNS_NEEDED)} of {BASELINE_RUNS_NEEDED} similar runs toward stronger comparison
                </Text>
              </View>
            </View>
            <View style={styles.baselineTrack}>
              <View style={[styles.baselineFill, { width: `${Math.min(100, (includedRuns / BASELINE_RUNS_NEEDED) * 100)}%` }]} />
            </View>
            <Text style={styles.baselineNote}>
              SubStride starts with your clean runner baseline, then narrows toward workout, shoe, surface, and exact-combination baselines only when enough clean runs exist.
            </Text>
          </View>
        </Section>
      ) : null}

      <Section
        title={selectedRecord ? 'Selected session' : 'Session preview'}
        subtitle={selectedRecord ? `${selectedRecord.label} · ${formatSessionDate(selectedRecord)}` : 'Current unsaved run preview'}
      >
        <CategoryScoreBar label="Total Session Load" value={loadScore(sessionMetrics)} sublabel="Mechanical + perceived beta load for this run" />
        <CategoryScoreBar label="Mechanical Session Load" value={sessionMetrics.mechanicalLoad.value.score0To100} sublabel="Pressure + IMU load for this run" />
        <CategoryScoreBar label="Perceived Session Load" value={sessionMetrics.perceivedLoad.value.score0To100 ?? 0} sublabel={sessionMetrics.perceivedLoad.value.score0To100 == null ? 'Not supplied' : 'Effort x duration'} />
        <CategoryScoreBar label="Load balance" value={sessionMetrics.categoryScores.loadBalance.value} sublabel="Inner/outer load symmetry" higherIsBetter />
        <CategoryScoreBar label="Impact load" value={sessionMetrics.categoryScores.impactLoad.value} sublabel="Experimental impact proxy" />
        <CategoryScoreBar label="Fatigue shift" value={sessionMetrics.categoryScores.fatigueShift.value} sublabel="End-of-run load change" />
      </Section>

      <Section title="Shoe comparison" subtitle="Condition-adjusted beta score from saved sessions">
        {shoeScores.length === 0 ? (
          <Placeholder
            icon="footsteps-outline"
            title="Save sessions to compare shoes"
            text="Shoe profiles are stored with each session. Add or select shoes in Settings before saving runs."
          />
        ) : (
          shoeScores.map((shoe) => (
            <View key={shoe.shoeId} style={styles.shoeScoreCard}>
              <View style={styles.shoeScoreHeader}>
                <View style={styles.shoeScoreMain}>
                  <Text style={styles.shoeScoreTitle}>{shoe.shoeName}</Text>
                  <Text style={styles.shoeScoreMeta}>
                    {shoe.runCount} run{shoe.runCount === 1 ? '' : 's'} · {shoe.surfaces}
                  </Text>
                </View>
                <View style={styles.shoeScoreBadge}>
                  <Text style={styles.shoeScoreBadgeLabel}>Shoe Score:</Text>
                  <Text style={[styles.shoeScoreValue, { color: shoe.score >= 70 ? colors.success : shoe.score >= 50 ? colors.brand : colors.warning }]}>
                    {Math.round(shoe.score)}
                  </Text>
                </View>
              </View>
              <View style={styles.shoeScoreDetails}>
                <MiniStat label="Load" value={shoe.adjustedLoad} />
                <MiniStat label="Effort" value={shoe.perceivedEffort} />
                <MiniStat label="Pain" value={shoe.pain * 10} />
                <MiniStat label="Impact" value={shoe.impact} />
                <MiniStat label="Balance" value={shoe.balance} higherIsBetter />
              </View>
            </View>
          ))
        )}
        <Text style={styles.shoeScoreNote}>
          The score adjusts by saved surface, workout type, and effort. Pace/GPS is not available in this beta build, so pace matching will be added when GPS or Garmin data is connected.
        </Text>
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

      <Section title="Training load trend" subtitle="Tap a saved run to update session stats, Insights, and Map">
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
                      { height: Math.max(4, (v / 100) * 80) },
                      isLast && styles.chartBarActive,
                    ]}
                  />
                  <Text style={styles.chartRun}>{isLast ? 'Now' : `R${i + 1}`}</Text>
                </View>
              );
            })}
          </View>
          {history.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.runScroller}>
              {history.map((record, index) => {
                const selected = record.session.id === selectedRecord?.session.id;
                return (
                  <TouchableOpacity
                    key={record.session.id}
                    style={[styles.runChip, selected && styles.runChipSelected]}
                    onPress={() => onSelectSession(record.session.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.runChipTitle, selected && styles.runChipTitleSelected]}>
                      Run {index + 1}
                    </Text>
                    <Text style={[styles.runChipScore, selected && styles.runChipScoreSelected]}>
                      {loadScore(record.metrics)}
                    </Text>
                    <Text style={[styles.runChipMeta, selected && styles.runChipMetaSelected]} numberOfLines={1}>
                      {record.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}
          <Text style={styles.chartNote}>
            Current Training Load decays with time. A run contributes less after five days than it does two hours after finishing.
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

function MiniStat({ label, value, higherIsBetter = false }: { label: string; value: number; higherIsBetter?: boolean }) {
  const color = higherIsBetter
    ? value >= 70 ? colors.success : value >= 50 ? colors.brand : colors.warning
    : value <= 35 ? colors.success : value <= 60 ? colors.brand : colors.warning;
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniStatValue, { color }]}>{Math.round(value)}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function RiskGateCard({ text }: { text: string }) {
  return (
    <View style={styles.riskGateCard}>
      <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} />
      <View style={styles.riskGateText}>
        <Text style={styles.riskGateTitle}>Risk signal gated</Text>
        <Text style={styles.riskGateSubtitle}>{text}</Text>
      </View>
    </View>
  );
}

function formatAsOf(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'now';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatSessionDate(record: BetaSessionRecord): string {
  const value = record.session.endedAt ?? record.session.startedAt ?? record.session.createdAt;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return labelForSurface(record.context.surface);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${labelForSurface(record.context.surface)} · ${labelForWorkout(record.context.workoutType)}`;
}

function loadNarrative(load: LongitudinalTrainingLoad): string {
  if (load.status === 'no_data') {
    return 'Save runs to build a timestamp-aware training load state.';
  }
  if (load.status === 'session_only') {
    return 'Session history is still too young for a confident rolling-load signal. Current Training Load is shown, but risk stays gated.';
  }
  const ratio = load.total.acuteChronicRatio;
  const ratioText = ratio == null ? 'not established yet' : `${ratio.toFixed(2)}x baseline load`;
  return `Current Training Load is ${load.currentLoadScore0To100}/100. Recent load is ${ratioText}; status is ${load.status.replace('_', ' ')}.`;
}

function riskRequirementText(load: LongitudinalTrainingLoad): string {
  const days = Math.floor(load.observedSpanDays);
  if (load.validSessionCount < 3) {
    return `Needs at least 3 valid saved runs and 28 days of history · ${load.validSessionCount}/3 valid runs`;
  }
  if (load.observedSpanDays < 28) {
    return `Needs 28 days of saved-run history · ${days}/28 days`;
  }
  return 'Needs a stable chronic baseline before showing this signal';
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
  riskGateCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 10, borderRadius: radius.md, backgroundColor: colors.bgCardAlt, borderWidth: 1, borderColor: colors.border },
  riskGateText: { flex: 1 },
  riskGateTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  riskGateSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  riskNote: { marginTop: 2, fontSize: 11, lineHeight: 16, color: colors.textTertiary },
  placeholder: { alignItems: 'center', padding: 20, gap: 10 },
  placeholderIcon: { marginBottom: 4 },
  placeholderTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  placeholderText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  shoeScoreCard: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  shoeScoreHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  shoeScoreMain: { flex: 1 },
  shoeScoreTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  shoeScoreMeta: { marginTop: 2, fontSize: 11, color: colors.textTertiary },
  shoeScoreBadge: { alignItems: 'flex-end', gap: 2 },
  shoeScoreBadgeLabel: { fontSize: 10, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase' },
  shoeScoreValue: { fontSize: 24, lineHeight: 28, fontWeight: '900' },
  shoeScoreDetails: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  miniStat: { flex: 1, minWidth: 58, padding: 8, borderRadius: radius.sm, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  miniStatValue: { fontSize: 15, fontWeight: '900' },
  miniStatLabel: { marginTop: 2, fontSize: 10, color: colors.textTertiary, fontWeight: '700' },
  shoeScoreNote: { marginTop: 10, fontSize: 11, color: colors.textTertiary, lineHeight: 16 },
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
  runScroller: { gap: 8, paddingVertical: 2 },
  runChip: { width: 92, minHeight: 74, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCardAlt },
  runChipSelected: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  runChipTitle: { fontSize: 11, fontWeight: '800', color: colors.textTertiary },
  runChipTitleSelected: { color: colors.brand },
  runChipScore: { marginTop: 4, fontSize: 20, lineHeight: 24, fontWeight: '900', color: colors.textPrimary },
  runChipScoreSelected: { color: colors.brand },
  runChipMeta: { marginTop: 2, fontSize: 10, color: colors.textTertiary },
  runChipMetaSelected: { color: colors.textBrand },
  chartNote: { fontSize: 11, color: colors.textTertiary, lineHeight: 16, fontStyle: 'italic' },
});
