import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { scoreGradientColor } from '../theme';

interface Props {
  score: number;
  category: string;
  size?: number;
  label?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very High',
};

export function ScoreRing({ score, category: _category, size = 120, label = 'Training Load' }: Props) {
  const color = scoreGradientColor(score);
  const radius = size / 2;
  const fontSize = size * 0.3;
  const borderWidth = size * 0.05;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth,
            borderColor: color,
          },
        ]}
      >
        <Text style={[styles.score, { fontSize, color }]}>{score}</Text>
        <Text style={[styles.unit, { color: color + 'aa', fontSize: size * 0.1 }]}>/ 100</Text>
      </View>
      <Text style={[styles.category, { color }]}>{CATEGORY_LABELS[_category] ?? _category}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 8 },
  ring: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  score: { fontWeight: '800', lineHeight: undefined },
  unit: { fontWeight: '600', marginTop: 1 },
  category: { fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  label: { fontSize: 12, fontWeight: '500', color: '#8492a6', letterSpacing: 0.4, textTransform: 'uppercase' },
});
