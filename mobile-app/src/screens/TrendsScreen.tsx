import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BaselineSummary, RunMetrics } from '@substride/analytics';
import type { BetaSessionRecord } from '../domain/betaAppModel';
import { labelForSurface, labelForWorkout } from '../domain/betaAppModel';
import { Section } from '../components/Section';
import { CategoryScoreBar } from '../components/CategoryScoreBar';
import { colors, radius } from '../theme';

interface Props {
  metrics: RunMetrics;
  history: BetaSessionRecord[];
  baseline: BaselineSummary;
}

const BASELINE_RUNS_NEEDED = 5;

export function TrendsScreen({ metrics, history, baseline }: Props) {
  const includedRuns = baseline.includedRunCount;
  const recentRuns = history.slice(-5);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Baseline building status */}
      <Section title="Baseline status">
        <View style={styles.baselineCard}>
          <View style={styles.baselineIconRow}>
            <Text style={styles.baselineIcon}>📊</Text>
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
        <CategoryScoreBar label="Training Strain" value={metrics.trainingStrain.value} sublabel="Overall session load" />
        <CategoryScoreBar label="Load balance" value={metrics.categoryScores.loadBalance.value} sublabel="Medial/lateral symmetry" />
        <CategoryScoreBar label="Impact load" value={metrics.categoryScores.impactLoad.value} sublabel="Impact proxy" />
        <CategoryScoreBar label="Fatigue shift" value={metrics.categoryScores.fatigueShift.value} sublabel="End-of-run load change" />
      </Section>

      <Section title="Shoe comparison">
        {history.length === 0 ? (
          <Placeholder
            icon="👟"
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
              <Text style={styles.historyScore}>{record.metrics.trainingStrain.value}</Text>
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

      {/* Trend chart placeholder */}
      <Section title="Training Strain trend">
        <View style={styles.chartPlaceholder}>
          <View style={styles.chartBars}>
            {(recentRuns.length > 0 ? recentRuns.map((record) => record.metrics.trainingStrain.value) : [42, 58, 51, 67, metrics.trainingStrain.value]).map((v, i, arr) => {
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
                  <Text style={styles.chartRun}>{i === arr.length - 1 ? 'Now' : `R${i + 1}`}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.chartNote}>
            {recentRuns.length > 0 ? 'Recent saved sessions. Save more runs to make trend comparisons useful.' : 'Illustrative placeholder until sessions are saved.'}
          </Text>
        </View>
      </Section>
    </ScrollView>
  );
}

function Placeholder({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderIcon}>{icon}</Text>
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
  baselineIcon: { fontSize: 28 },
  baselineText: { flex: 1 },
  baselineTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  baselineSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  baselineTrack: { height: 8, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  baselineFill: { height: '100%', backgroundColor: colors.brand, borderRadius: radius.full },
  baselineNote: { fontSize: 12, lineHeight: 17, color: colors.textTertiary },
  placeholder: { alignItems: 'center', padding: 20, gap: 10 },
  placeholderIcon: { fontSize: 32 },
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
