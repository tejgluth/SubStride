import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
  onPress?: () => void;
}

export function MetricRow({ label, value, detail, accent, onPress }: Props) {
  const Row = onPress ? TouchableOpacity : View;
  return (
    <Row style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.left}>
        <Text style={styles.label}>{label}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <Text style={[styles.value, accent && styles.accentValue]}>{value}</Text>
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  left: { flex: 1, paddingVertical: 8 },
  label: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  detail: { marginTop: 2, fontSize: 11, color: colors.textTertiary, lineHeight: 15 },
  value: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  accentValue: { color: colors.brand },
  chevron: { fontSize: 18, color: colors.textTertiary, marginLeft: 2 },
});
