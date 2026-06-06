import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow } from '../theme';

interface Props {
  title?: string;
  titleAccessory?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  noPad?: boolean;
}

export function Section({ title, titleAccessory, subtitle, children, noPad }: Props) {
  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {titleAccessory}
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      <View style={noPad ? undefined : styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  title: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.textTertiary, letterSpacing: 0.6, textTransform: 'uppercase' },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textTertiary },
  body: { padding: 16 },
});
