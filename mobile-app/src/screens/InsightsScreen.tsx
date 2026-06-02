import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RunMetrics } from '@substride/analytics';
import { scoreCategory } from '@substride/analytics';
import { Section } from '../components/Section';
import { InsightCard } from '../components/InsightCard';
import { SimBadge } from '../components/SimBadge';
import { colors } from '../theme';

interface Props {
  metrics: RunMetrics;
  explanation: string;
  isSimulated?: boolean;
}

function buildInsights(metrics: RunMetrics): Array<{
  icon: string;
  title: string;
  summary: string;
  detail: string;
  tag?: 'elevated' | 'within_baseline' | 'notable';
}> {
  const insights: Array<{ icon: string; title: string; summary: string; detail: string; tag?: 'elevated' | 'within_baseline' | 'notable' }> = [];
  const category = scoreCategory(metrics.trainingStrain.value);

  // Training strain
  insights.push({
    icon: '⚡',
    title: 'Training Strain',
    summary: `${metrics.trainingStrain.value}/100 — ${category.replace('_', ' ')} relative load for this session.`,
    detail: `Training Strain combines cumulative load, peak load, load rate, impact proxy, and fatigue shift. It is scaled to your personal baseline when available. ${category === 'high' || category === 'very_high' ? 'This session has an elevated load pattern that may be worth monitoring, especially if stacked with other high-effort sessions.' : 'This is within a manageable range for most runners.'}`,
    tag: category === 'high' || category === 'very_high' ? 'elevated' : 'within_baseline',
  });

  // Load balance
  const balance = metrics.medialLateralBalance.value;
  if (balance < 70) {
    insights.push({
      icon: '⚖️',
      title: 'Medial/lateral imbalance',
      summary: `Balance score ${balance.toFixed(0)}/100 — elevated asymmetry between inner and outer foot load.`,
      detail: `An imbalanced load pattern (score below 70) may indicate a tendency to pronate or supinate more than your baseline. This is a relative indicator from your 16-zone pressure map and may reflect shoe wear, surface camber, or running form. Worth monitoring over multiple sessions.`,
      tag: 'elevated',
    });
  } else {
    insights.push({
      icon: '⚖️',
      title: 'Medial/lateral balance',
      summary: `Balance score ${balance.toFixed(0)}/100 — load distribution is relatively symmetric.`,
      detail: `Medial/lateral balance is computed from the relative load difference between the inner (medial) and outer (lateral) zones of your foot. A score above 70 suggests reasonable symmetry for this session.`,
      tag: 'within_baseline',
    });
  }

  // Impact load
  const impact = metrics.categoryScores.impactLoad.value;
  if (impact > 65) {
    insights.push({
      icon: '💥',
      title: 'Higher impact load pattern',
      summary: `Impact proxy score ${impact.toFixed(0)}/100 — higher than a typical easy run pattern.`,
      detail: `Impact load is estimated from vertical acceleration peaks combined with the pressure load rate. A higher score may indicate heavier heel striking, faster cadence, or terrain characteristics. This is an experimental proxy, not a validated ground reaction force measurement.`,
      tag: 'elevated',
    });
  } else {
    insights.push({
      icon: '💥',
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
      icon: '📉',
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
      icon: '🦶',
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
          <Text style={styles.aiTitle}>Optional AI summary</Text>
          <Text style={styles.aiText}>
            An AI summary can be generated from your computed metrics using the OpenAI prompt
            that is bundled in the analytics engine. The AI receives only the deterministic
            computed values — it cannot access raw sensor data or invent new scores.
          </Text>
          <Text style={styles.aiNote}>
            Configure an API key in Settings to enable AI summaries.
          </Text>
        </View>
      </Section>

      <Section title="Data sources">
        <Text style={styles.sources}>
          • Cadence — gait event detection via load threshold{'\n'}
          • Contact time — foot-strike to toe-off event window{'\n'}
          • Load balance — medial/lateral zone group ratio{'\n'}
          • Impact proxy — vertical accel + pressure load rate{'\n'}
          • Fatigue shift — first vs. second half forefoot fraction{'\n'}
          • Training Strain — weighted composite of all above
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
