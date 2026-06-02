import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

interface Props {
  label: string;
  value: number;
  sublabel?: string;
  colorOverride?: string;
}

function barColor(value: number): string {
  if (value <= 35) return colors.scoreLow;
  if (value <= 65) return colors.scoreModerate;
  if (value <= 85) return colors.scoreHigh;
  return colors.scoreVeryHigh;
}

export function CategoryScoreBar({ label, value, sublabel, colorOverride }: Props) {
  const color = colorOverride ?? barColor(value);
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.score, { color }]}>{Math.round(value)}</Text>
      </View>
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      <View style={styles.track}>
        <View style={{ flex: clamped, backgroundColor: color, borderRadius: radius.full }} />
        <View style={{ flex: 100 - clamped }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  sublabel: { fontSize: 11, color: colors.textTertiary, marginBottom: 4 },
  score: { fontSize: 13, fontWeight: '800' },
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
  },
});
