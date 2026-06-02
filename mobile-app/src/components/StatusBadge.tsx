import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

type Status = 'pass' | 'warn' | 'fail' | 'pending' | 'skipped';

const CONFIG: Record<Status, { bg: string; border: string; text: string; label: string }> = {
  pass: { bg: colors.successLight, border: colors.successBorder, text: colors.success, label: 'Pass' },
  warn: { bg: colors.warningLight, border: colors.warningBorder, text: colors.warning, label: 'Warn' },
  fail: { bg: colors.errorLight, border: colors.errorBorder, text: colors.error, label: 'Fail' },
  pending: { bg: colors.bgCardAlt, border: colors.border, text: colors.textTertiary, label: 'Pending' },
  skipped: { bg: colors.bgCardAlt, border: colors.border, text: colors.textTertiary, label: 'Skipped' },
};

export function StatusBadge({ status }: { status: Status }) {
  const cfg = CONFIG[status] ?? CONFIG.pending;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={[styles.text, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});
