import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

export function SimBadge({ label = 'Simulated data' }: { label?: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.dot}>⬡</Text>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.simPurpleLight,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#c4b5fd',
    alignSelf: 'flex-start',
  },
  dot: { fontSize: 10, color: colors.simPurple },
  text: { fontSize: 11, fontWeight: '700', color: colors.simPurple, letterSpacing: 0.3 },
});
