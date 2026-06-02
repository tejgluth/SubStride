import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, shadow } from '../theme';

interface Props {
  icon: string;
  title: string;
  summary: string;
  detail?: string;
  tag?: 'elevated' | 'within_baseline' | 'notable';
}

const TAG_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  elevated: { bg: colors.warningLight, text: colors.warning, label: 'Elevated' },
  within_baseline: { bg: colors.successLight, text: colors.success, label: 'Within baseline' },
  notable: { bg: colors.brandLight, text: colors.brand, label: 'Notable' },
};

export function InsightCard({ icon, title, summary, detail, tag }: Props) {
  const [expanded, setExpanded] = useState(false);
  const tagStyle = tag ? TAG_STYLES[tag] : null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.8}
    >
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {tagStyle ? (
              <View style={[styles.tag, { backgroundColor: tagStyle.bg }]}>
                <Text style={[styles.tagText, { color: tagStyle.text }]}>{tagStyle.label}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.summary}>{summary}</Text>
        </View>
        <Text style={[styles.chevron, expanded && styles.chevronOpen]}>›</Text>
      </View>
      {expanded && detail ? (
        <View style={styles.detail}>
          <Text style={styles.detailText}>{detail}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 10,
    overflow: 'hidden',
    ...shadow.sm,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.bgCardAlt,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 20 },
  content: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  tagText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  summary: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  chevron: { fontSize: 20, color: colors.textTertiary, marginTop: 1, transform: [{ rotate: '0deg' }] },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  detail: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    marginTop: 0,
  },
  detailText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
});
