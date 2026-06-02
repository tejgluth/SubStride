import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ShoeProfile } from '@substride/analytics';
import { Section } from '../components/Section';
import {
  labelForSurface,
  labelForWorkout,
  SURFACE_OPTIONS,
  WORKOUT_OPTIONS,
  type BetaRunComputation,
  type BetaSessionContext,
  type SurfaceTag,
  type WorkoutTag,
} from '../domain/betaAppModel';
import { colors, radius } from '../theme';

interface Props {
  computed: BetaRunComputation;
  shoes: ShoeProfile[];
  onUpdateContext: (patch: Partial<BetaSessionContext>) => void;
  onSaveSession: () => void;
  onDiscard: () => void;
}

export function PostRunScreen({ computed, shoes, onUpdateContext, onSaveSession, onDiscard }: Props) {
  const { context, activeShoe, metrics } = computed;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Section title="Post-run check-in" subtitle="These answers are saved with the session for trends and baselines">
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{metrics.trainingStrain.value}</Text>
            <Text style={styles.summaryLabel}>Strain</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{metrics.steps.length}</Text>
            <Text style={styles.summaryLabel}>Steps</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryValue}>{metrics.peakLoad.value.toFixed(0)}</Text>
            <Text style={styles.summaryLabel}>Peak load</Text>
          </View>
        </View>
      </Section>

      <Section title="Shoe">
        {shoes.length > 0 ? (
          <View style={styles.shoeList}>
            {shoes.map((shoe) => {
              const selected = activeShoe?.id === shoe.id || context.shoeId === shoe.id;
              return (
                <TouchableOpacity
                  key={shoe.id}
                  style={[styles.shoeOption, selected && styles.shoeOptionSelected]}
                  onPress={() => onUpdateContext({ shoeId: shoe.id })}
                  activeOpacity={0.8}
                >
                  <View style={styles.shoeOptionMain}>
                    <Text style={[styles.shoeOptionName, selected && styles.shoeOptionNameSelected]}>{shoe.name}</Text>
                    <Text style={styles.shoeOptionMeta}>
                      {[shoe.brand, shoe.model, shoe.size].filter(Boolean).join(' · ') || 'Saved shoe'}
                    </Text>
                  </View>
                  {selected ? (
                    <View style={styles.selectedBadge}>
                      <Text style={styles.selectedBadgeText}>Used</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={styles.helper}>No saved shoes yet. Add and name shoes in Settings before saving run history.</Text>
        )}
      </Section>

      <Section title="Surface">
        <View style={styles.tagRow}>
          {SURFACE_OPTIONS.map((option) => (
            <TagButton
              key={option.id}
              label={option.label}
              selected={context.surface === option.id}
              onPress={() => onUpdateContext({ surface: option.id as SurfaceTag })}
            />
          ))}
        </View>
      </Section>

      <Section title="Workout">
        <View style={styles.tagRow}>
          {WORKOUT_OPTIONS.map((option) => (
            <TagButton
              key={option.id}
              label={option.label}
              selected={context.workoutType === option.id}
              onPress={() => onUpdateContext({ workoutType: option.id as WorkoutTag })}
            />
          ))}
        </View>
      </Section>

      <Section title="How did it feel?">
        <View style={styles.stepperRow}>
          <Stepper label="Pain" value={context.painScore0To10} onChange={(painScore0To10) => onUpdateContext({ painScore0To10 })} />
          <Stepper label="Effort" value={context.perceivedEffort0To10} onChange={(perceivedEffort0To10) => onUpdateContext({ perceivedEffort0To10 })} />
        </View>
        <Text style={styles.contextLine}>
          Saving as {labelForSurface(context.surface)} · {labelForWorkout(context.workoutType)}
        </Text>
      </Section>

      <Section title="Notes">
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={context.notes ?? ''}
          onChangeText={(notes) => onUpdateContext({ notes })}
          placeholder="Optional notes"
          placeholderTextColor={colors.textTertiary}
          multiline
        />
      </Section>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.discardBtn} onPress={onDiscard} activeOpacity={0.8}>
          <Text style={styles.discardText}>Discard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={onSaveSession} activeOpacity={0.8}>
          <Text style={styles.saveText}>Save session</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function TagButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tag, selected && styles.tagSelected]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(Math.max(0, value - 1))}>
          <Text style={styles.stepperBtnText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}/10</Text>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(Math.min(10, value + 1))}>
          <Text style={styles.stepperBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCell: { flex: 1, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.bgCardAlt, borderWidth: 1, borderColor: colors.border },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  summaryLabel: { marginTop: 2, fontSize: 10, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, color: colors.textPrimary, backgroundColor: colors.bgCardAlt, fontSize: 14, fontWeight: '600' },
  notesInput: { minHeight: 82, paddingTop: 10, textAlignVertical: 'top' },
  helper: { marginTop: 8, fontSize: 12, lineHeight: 17, color: colors.textTertiary },
  shoeList: { gap: 8 },
  shoeOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCardAlt },
  shoeOptionSelected: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  shoeOptionMain: { flex: 1 },
  shoeOptionName: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  shoeOptionNameSelected: { color: colors.brand },
  shoeOptionMeta: { marginTop: 2, fontSize: 11, color: colors.textTertiary },
  selectedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.brandBorder },
  selectedBadgeText: { fontSize: 11, fontWeight: '800', color: colors.brand },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.bgCardAlt, borderWidth: 1, borderColor: colors.border },
  tagSelected: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  tagText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  tagTextSelected: { color: colors.brand },
  stepperRow: { flexDirection: 'row', gap: 10 },
  stepper: { flex: 1, padding: 10, backgroundColor: colors.bgCardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stepperLabel: { fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stepperBtn: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 18, fontWeight: '800', color: colors.brand },
  stepperValue: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  contextLine: { marginTop: 10, fontSize: 12, color: colors.textTertiary },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  discardBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  discardText: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  saveBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.brand },
  saveText: { fontSize: 13, fontWeight: '800', color: colors.textInverse },
});
