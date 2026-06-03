import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RunMetrics } from '@substride/analytics';
import { canShowAiExplanation, scoreCategory } from '@substride/analytics';
import { Ionicons } from '@expo/vector-icons';
import { Section } from '../components/Section';
import { InsightCard } from '../components/InsightCard';
import { SimBadge } from '../components/SimBadge';
import { colors } from '../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  metrics: RunMetrics;
  explanation: string;
  isSimulated?: boolean;
}

function buildInsights(metrics: RunMetrics): Array<{
  icon: IoniconName;
  title: string;
  summary: string;
  detail: string;
  tag?: 'elevated' | 'within_baseline' | 'notable';
}> {
  const insights: Array<{ icon: IoniconName; title: string; summary: string; detail: string; tag?: 'elevated' | 'within_baseline' | 'notable' }> = [];

  // Confidence gate: if the run's score is blocked, do not present confident-looking claims.
  if (metrics.confidence && !metrics.confidence.scoreShowable) {
    insights.push({
      icon: 'construct-outline',
      title: 'Low-quality run — score withheld',
      summary: `Training Load is hidden for this run (${metrics.confidence.blocking.join(', ') || 'low confidence'}).`,
      detail: `SubStride blocks a confident score when data quality is too low to trust. Reasons: ${[...metrics.confidence.blocking, ...metrics.confidence.reasonCodes].join(', ') || 'unknown'}. Re-run calibration and record a longer, cleaner session. Raw values are still available in the Validation/Debug tab.`,
      tag: 'elevated',
    });
    return insights;
  }
  const lowConfidence = metrics.confidence ? metrics.confidence.level === 'low' : false;
  const totalLoad = metrics.totalTrainingLoad.value;
  const category = scoreCategory(totalLoad.score0To100);

  if (lowConfidence) {
    insights.push({
      icon: 'alert-circle-outline',
      title: 'Low confidence this run',
      summary: `Confidence is low (${metrics.confidence?.reasonCodes.join(', ') || 'data quality'}).`,
      detail: `Treat the numbers below as rough. Confidence was reduced because: ${metrics.confidence?.reasonCodes.join(', ') || 'unknown'}.`,
      tag: 'notable',
    });
  }

  // Training load
  insights.push({
    icon: 'flash-outline',
    title: 'Total Training Load',
    summary: `${totalLoad.score0To100}/100 — ${category.replace('_', ' ')} beta load for this session.`,
    detail: `Total Training Load combines Mechanical Load (${totalLoad.mechanicalScore0To100}/100) with Perceived Load${totalLoad.perceivedScore0To100 == null ? ' when effort is supplied' : ` (${totalLoad.perceivedScore0To100}/100)`}. Mechanical Load comes from pressure and IMU signals; Perceived Load is RPE-minutes. ${category === 'high' || category === 'very_high' ? 'This session has an elevated load pattern that may be worth monitoring, especially if stacked with other high-effort sessions.' : 'This is within a manageable range for most runners.'}`,
    tag: category === 'high' || category === 'very_high' ? 'elevated' : 'within_baseline',
  });

  insights.push({
    icon: 'bar-chart-outline',
    title: 'Mechanical vs perceived',
    summary: `Mechanical ${metrics.mechanicalLoad.value.score0To100}/100${metrics.perceivedLoad.value.score0To100 == null ? ' · effort not included' : ` · perceived ${metrics.perceivedLoad.value.score0To100}/100`}.`,
    detail: metrics.perceivedLoad.value.rawRpeMinutes == null
      ? 'No perceived-effort score was supplied, so this total is currently a mechanical-only estimate.'
      : `Perceived Load used ${metrics.perceivedLoad.value.rawRpeMinutes.toFixed(0)} RPE-minutes from effort ${metrics.perceivedLoad.value.rpe0To10}/10 and session duration.`,
    tag: 'notable',
  });

  // Load balance
  const balance = metrics.medialLateralBalance.value;
  if (balance < 70) {
    insights.push({
      icon: 'swap-horizontal-outline',
      title: 'Medial/lateral load shift',
      summary: `Balance score ${balance.toFixed(0)}/100 — more load on one side (inner vs outer) than the other this session.`,
      detail: `A side-weighted load pattern (score below 70) means a larger share of relative load sat on the inner or outer zones of your foot map. This is a relative load indicator only — it does not diagnose pronation, supination, or any condition — and may reflect sensor placement, shoe wear, surface camber, or form. Worth monitoring over multiple sessions. Note: left-foot inner/outer labelling depends on a hardware wiring assumption that is not yet verified.`,
      tag: 'elevated',
    });
  } else {
    insights.push({
      icon: 'swap-horizontal-outline',
      title: 'Medial/lateral balance',
      summary: `Balance score ${balance.toFixed(0)}/100 — inner/outer load is relatively even.`,
      detail: `Medial/lateral balance is computed from the relative load difference between the inner and outer zones of your foot map. A score above 70 suggests reasonably even inner/outer loading for this session. This is a relative indicator, not a clinical assessment.`,
      tag: 'within_baseline',
    });
  }

  // Impact load
  const impact = metrics.categoryScores.impactLoad.value;
  if (impact > 65) {
    insights.push({
      icon: 'flame-outline',
      title: 'Higher impact load pattern',
      summary: `Impact proxy score ${impact.toFixed(0)}/100 — higher than a typical easy run pattern.`,
      detail: `Impact load is estimated from vertical acceleration peaks combined with the pressure load rate. A higher score may indicate heavier heel striking, faster cadence, or terrain characteristics. This is an experimental proxy, not a validated ground reaction force measurement.`,
      tag: 'elevated',
    });
  } else {
    insights.push({
      icon: 'flame-outline',
      title: 'Impact load pattern',
      summary: `Impact proxy score ${impact.toFixed(0)}/100 — within a typical range for this effort level.`,
      detail: `Impact load is estimated from vertical acceleration peaks and pressure load rate. This is an experimental proxy metric, not a validated biomechanical measurement.`,
      tag: 'within_baseline',
    });
  }

  // Fatigue shift
  const fatigue = metrics.fatigueShift.value;
  if (fatigue > 8) {
    insights.push({
      icon: 'trending-down-outline',
      title: 'Fatigue load shift detected',
      summary: `Forefoot load shifted ${fatigue.toFixed(1)} percentage points between first and second half of the run.`,
      detail: `A forefoot load shift over the course of a run can reflect changing gait mechanics as fatigue sets in. This pattern — heavier forefoot loading in the second half — is common in longer or harder efforts. Compare across sessions to see whether this pattern is consistent.`,
      tag: 'notable',
    });
  }

  // Forefoot overload
  const forefoot = metrics.categoryScores.forefootMetatarsalLoad.value;
  if (forefoot > 70) {
    insights.push({
      icon: 'footsteps-outline',
      title: 'Elevated forefoot/metatarsal load',
      summary: `Forefoot zone score ${forefoot.toFixed(0)}/100 — higher than a typical heel-to-toe pattern.`,
      detail: `A high forefoot score indicates that a larger proportion of your total load is concentrated in the metatarsal and toe zones. This is common in forefoot runners and in fatigue states. An elevated and increasing pattern over multiple sessions may be worth monitoring.`,
      tag: forefoot > 80 ? 'elevated' : 'notable',
    });
  }

  return insights;
}

export function InsightsScreen({ metrics, explanation, isSimulated }: Props) {
  const insights = buildInsights(metrics);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {isSimulated ? (
        <View style={styles.simRow}>
          <SimBadge label="Insights from simulated data" />
        </View>
      ) : null}

      <Section title="Deterministic analysis">
        <Text style={styles.explanation}>{explanation}</Text>
        <Text style={styles.disclaimer}>
          All insights below are generated deterministically from your sensor data.
          Scores are relative indicators, not medical measurements.
        </Text>
      </Section>

      <Section title="Key observations" subtitle="Tap any card for more detail">
        {insights.map((insight, i) => (
          <InsightCard
            key={i}
            icon={insight.icon}
            title={insight.title}
            summary={insight.summary}
            detail={insight.detail}
            tag={insight.tag}
          />
        ))}
      </Section>

      <Section title="AI interpretation">
        <View style={styles.aiBox}>
          {canShowAiExplanation(metrics) ? (
            <>
              <Text style={styles.aiTitle}>Optional AI summary</Text>
              <Text style={styles.aiText}>
                An AI summary can be generated from your computed metrics using the OpenAI prompt
                that is bundled in the analytics engine. The AI receives only the deterministic
                computed values (and their confidence) — it cannot access raw sensor data, recompute
                scores, invent metrics, or diagnose. It is labelled as interpretation, not measurement.
              </Text>
              <Text style={styles.aiNote}>
                Configure an API key in Settings to enable AI summaries.
              </Text>
            </>
          ) : (
            <Text style={styles.aiText}>
              AI summary is unavailable for this run because the required computed metrics are
              missing or invalid.
            </Text>
          )}
        </View>
      </Section>

      <Section title="Data sources">
        <Text style={styles.sources}>
          • Cadence — gait event detection via load threshold{'\n'}
          • Contact time — foot-strike to toe-off event window{'\n'}
          • Load balance — medial/lateral zone group ratio{'\n'}
          • Impact proxy — vertical accel + pressure load rate{'\n'}
          • Fatigue shift — first vs. second half forefoot fraction{'\n'}
          • Mechanical Load — pressure + IMU beta load score{'\n'}
          • Perceived Load — RPE × duration when supplied{'\n'}
          • Total Training Load — weighted Mechanical + Perceived score
        </Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  simRow: { marginBottom: 10 },
  explanation: { fontSize: 14, lineHeight: 21, color: colors.textPrimary, marginBottom: 10 },
  disclaimer: { fontSize: 12, lineHeight: 17, color: colors.textTertiary, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight, paddingTop: 10 },
  aiBox: { padding: 14, backgroundColor: colors.bgCardAlt, borderRadius: 8, gap: 8 },
  aiTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  aiText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  aiNote: { fontSize: 12, color: colors.brand, fontWeight: '600' },
  sources: { fontSize: 12, lineHeight: 20, color: colors.textSecondary },
});
