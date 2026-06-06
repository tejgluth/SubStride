import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Section } from '../components/Section';
import { SimBadge } from '../components/SimBadge';
import { colors, radius } from '../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Scenario {
  id: string;
  label: string;
  description: string;
  expectedPatterns: string[];
  icon: IoniconName;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'normal_easy_run',
    label: 'Normal easy run',
    description: 'Balanced load pattern at comfortable pace',
    expectedPatterns: ['Balanced load', 'Stable fatigue shift', 'Moderate Session Load'],
    icon: 'walk-outline',
  },
  {
    id: 'fatigued_long_run',
    label: 'Fatigued long run',
    description: 'Progressive forefoot load shift as fatigue builds',
    expectedPatterns: ['Higher cumulative load', 'Larger first/second half shift', 'Elevated fatigue proxy'],
    icon: 'timer-outline',
  },
  {
    id: 'forefoot_overload',
    label: 'Forefoot overload',
    description: 'Concentrated load on metatarsal and toe zones',
    expectedPatterns: ['Elevated forefoot/metatarsal score', 'Higher toe-off contribution'],
    icon: 'footsteps-outline',
  },
  {
    id: 'heel_impact_spike',
    label: 'Heel impact spike',
    description: 'Strong heel strike with higher impact proxy',
    expectedPatterns: ['Higher heel load score', 'Higher impact proxy', 'Elevated load rate'],
    icon: 'flame-outline',
  },
  {
    id: 'medial_lateral_imbalance',
    label: 'Medial/lateral imbalance',
    description: 'Asymmetric load — more medial or lateral bias',
    expectedPatterns: ['Lower balance score', 'Side asymmetry'],
    icon: 'swap-horizontal-outline',
  },
  {
    id: 'new_old_shoe_comparison',
    label: 'Old shoe comparison',
    description: 'Higher heel impact, simulating a worn-out midsole',
    expectedPatterns: ['Higher impact proxy vs normal run', 'Higher heel load'],
    icon: 'fitness-outline',
  },
];

interface Props {
  selectedScenario: string;
  onSelectScenario: (id: string) => void;
}

export function SessionsScreen({ selectedScenario, onSelectScenario }: Props) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <SimBadge />
        <Text style={styles.headerNote}>Development use only — not real runner data</Text>
      </View>

      <Section title="Simulator scenarios" subtitle="Select a scenario to load it for all screens">
        {SCENARIOS.map((scenario) => {
          const isSelected = selectedScenario === scenario.id;
          return (
            <TouchableOpacity
              key={scenario.id}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => onSelectScenario(scenario.id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <Ionicons name={scenario.icon} size={22} color={isSelected ? colors.brand : colors.textTertiary} />
                <View style={styles.cardTitles}>
                  <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
                    {scenario.label}
                  </Text>
                  <Text style={styles.cardDesc}>{scenario.description}</Text>
                </View>
                {isSelected ? (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.patterns}>
                {scenario.expectedPatterns.map((pattern) => (
                  <View key={pattern} style={styles.patternTag}>
                    <Text style={styles.patternText}>{pattern}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </Section>

      <View style={styles.note}>
        <Text style={styles.noteTitle}>About simulator data</Text>
        <Text style={styles.noteText}>
          These sessions are procedurally generated using the analytics engine's simulator.
          They produce biomechanically plausible pressure patterns but are not collected from
          a real runner. Use them to validate that the analytics engine correctly identifies
          the expected load patterns for each scenario.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  headerNote: { fontSize: 12, color: colors.textTertiary, flex: 1 },
  card: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.bgCard,
    gap: 10,
  },
  cardSelected: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardIcon: { marginTop: 2 },
  cardTitles: { flex: 1 },
  cardLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardLabelSelected: { color: colors.brand },
  cardDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  checkmark: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand, justifyContent: 'center', alignItems: 'center' },
  checkmarkText: { fontSize: 14, color: colors.textInverse, fontWeight: '800' },
  patterns: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  patternTag: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.bgCardAlt, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  patternText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  note: { marginBottom: 20, padding: 14, backgroundColor: colors.bgCardAlt, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 6 },
  noteTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  noteText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
