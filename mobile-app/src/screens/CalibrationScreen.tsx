import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CalibrationProfile } from '@substride/analytics';
import { Section } from '../components/Section';
import { MetricRow } from '../components/MetricRow';
import { StatusBadge } from '../components/StatusBadge';
import { colors, radius, shadow } from '../theme';

interface StepDef {
  id: string;
  label: string;
  description: string;
  tip: string;
  status: 'pass' | 'warn' | 'fail' | 'pending' | 'skipped';
}

const CALIBRATION_STEPS: StepDef[] = [
  {
    id: 'no_load',
    label: 'No-load baseline',
    description: 'Pod off foot, lying flat. Captures sensor resting state.',
    tip: 'Place the insole flat on a table for 5–10 seconds. Avoid vibration.',
    status: 'pass',
  },
  {
    id: 'standing',
    label: 'Standing still',
    description: 'Stand normally on both feet for 10 seconds.',
    tip: 'Distribute weight evenly. Stand naturally — avoid leaning.',
    status: 'pass',
  },
  {
    id: 'weight_shift',
    label: 'Controlled weight shift',
    description: 'Shift weight slowly from medial to lateral edge and back.',
    tip: 'Three slow cycles from inner to outer edge. Keep knees straight.',
    status: 'pass',
  },
  {
    id: 'walk',
    label: 'Walk 10 steps',
    description: 'Walk naturally at normal pace.',
    tip: 'Walk at your regular cadence. No need to exaggerate heel strike or toe-off.',
    status: 'pass',
  },
  {
    id: 'jog',
    label: 'Optional short jog',
    description: 'Jog 30 seconds to capture dynamic load range.',
    tip: 'Easy pace only. This step improves gain calibration accuracy.',
    status: 'skipped',
  },
  {
    id: 'known_weight',
    label: 'Known-weight validation',
    description: 'Step on scale with known body weight to anchor pressure scale.',
    tip: 'Future feature — requires known-weight protocol support.',
    status: 'pending',
  },
];

interface Props {
  calibration: CalibrationProfile;
}

export function CalibrationScreen({ calibration }: Props) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const qualityColor = calibration.quality === 'pass'
    ? colors.success
    : calibration.quality === 'warn'
    ? colors.warning
    : colors.error;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Current calibration summary */}
      <Section title="Calibration status">
        <View style={[styles.qualityBanner, { backgroundColor: qualityColor + '18', borderColor: qualityColor + '44' }]}>
          <View style={[styles.qualityDot, { backgroundColor: qualityColor }]} />
          <View style={styles.qualityText}>
            <Text style={[styles.qualityLabel, { color: qualityColor }]}>
              {calibration.quality === 'pass' ? 'Calibration passed' : calibration.quality === 'warn' ? 'Calibration warning' : 'Calibration failed'}
            </Text>
            <Text style={styles.qualitySubtitle}>
              {calibration.quality === 'pass'
                ? 'All zones are within acceptable ranges.'
                : calibration.quality === 'warn'
                ? 'Some zones have elevated noise or reduced dynamic range.'
                : 'One or more zones are stuck or saturated. Results should not be saved until hardware is fixed.'}
            </Text>
          </View>
        </View>
        <MetricRow label="Quality" value={calibration.quality.toUpperCase()} />
        <MetricRow
          label="Bad channels"
          value={`${calibration.badChannels.length}`}
          detail={calibration.badChannels.length > 0 ? calibration.badChannels.map((b) => `zone ${b.zoneIndex + 1}: ${b.codes.join(', ')}`).join(' · ') : 'All zones clear'}
        />
        <MetricRow label="Shoe profile" value={calibration.shoeId ?? 'Not linked'} />
        <MetricRow label="Pod" value={calibration.podId} />
        <MetricRow label="Foot" value={calibration.foot} />
      </Section>

      {/* Calibration steps */}
      <Section title="Calibration protocol" subtitle="Tap each step for instructions">
        {CALIBRATION_STEPS.map((step) => (
          <TouchableOpacity
            key={step.id}
            style={styles.step}
            onPress={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
            activeOpacity={0.7}
          >
            <View style={styles.stepRow}>
              <View style={styles.stepLabel}>
                <Text style={styles.stepName}>{step.label}</Text>
                <Text style={styles.stepDesc}>{step.description}</Text>
              </View>
              <StatusBadge status={step.status} />
            </View>
            {expandedStep === step.id ? (
              <View style={styles.stepTip}>
                <Text style={styles.tipLabel}>Tip</Text>
                <Text style={styles.tipText}>{step.tip}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </Section>

      {/* What these steps check */}
      <Section title="What calibration checks">
        <MetricRow label="Stuck low/high" value="" detail="Zone reads near 0 or 4095 at rest — unusable" />
        <MetricRow label="Saturated" value="" detail="Zone maxes out under normal load — gain too low" />
        <MetricRow label="Too noisy" value="" detail="Noise standard deviation exceeds threshold" />
        <MetricRow label="No dynamic response" value="" detail="Zone doesn't change between no-load and walking" />
        <Text style={styles.note}>
          Calibration failures are treated as hardware or setup errors. Fix the pod, insole placement,
          or sensor connection before using the run for results.
        </Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  qualityBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 14,
  },
  qualityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 3, flexShrink: 0 },
  qualityText: { flex: 1 },
  qualityLabel: { fontSize: 14, fontWeight: '700' },
  qualitySubtitle: { marginTop: 3, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  step: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    paddingVertical: 12,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepLabel: { flex: 1 },
  stepName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  stepDesc: { marginTop: 2, fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  stepTip: {
    marginTop: 10,
    padding: 12,
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  tipLabel: { fontSize: 10, fontWeight: '700', color: colors.brand, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  tipText: { fontSize: 13, color: colors.brandDark, lineHeight: 19 },
  note: { marginTop: 10, fontSize: 12, lineHeight: 17, color: colors.textTertiary },
});
