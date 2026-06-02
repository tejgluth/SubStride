import React from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ShoeProfile, UserProfile } from '@substride/analytics';
import { Section } from '../components/Section';
import { MetricRow } from '../components/MetricRow';
import {
  labelForSurface,
  labelForWorkout,
  SURFACE_OPTIONS,
  WORKOUT_OPTIONS,
  type BetaPod,
  type BetaPodConnection,
  type BetaSessionContext,
  type SurfaceTag,
  type WorkoutTag,
} from '../domain/betaAppModel';
import { colors, radius } from '../theme';

interface Props {
  devMode: boolean;
  onToggleDevMode: (val: boolean) => void;
  profile: UserProfile;
  shoes: ShoeProfile[];
  pods: BetaPod[];
  context: BetaSessionContext;
  onUpdateContext: (patch: Partial<BetaSessionContext>) => void;
  onAddShoe: () => void;
  onRenameShoe: (shoeId: string, name: string) => void;
  onSetPodConnection: (podId: string, connection: BetaPodConnection) => void;
  onClearLocalData: () => void;
}

const CONNECTION_LABELS: Record<BetaPodConnection, string> = {
  connected: 'Connected',
  available: 'Available',
  disconnected: 'Off',
};

export function SettingsScreen({
  devMode,
  onToggleDevMode,
  profile,
  shoes,
  pods,
  context,
  onUpdateContext,
  onAddShoe,
  onRenameShoe,
  onSetPodConnection,
  onClearLocalData,
}: Props) {
  const activeShoe = shoes.find((shoe) => shoe.id === context.shoeId) ?? shoes[0];

  const confirmClear = () => {
    Alert.alert('Clear local beta data?', 'This resets locally saved shoes, pods, and session history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: onClearLocalData },
    ]);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.hardwareNotice}>
        <Text style={styles.hardwareNoticeTitle}>Hardware error detection</Text>
        <Text style={styles.hardwareNoticeText}>
          If a pod reports impossible readings, stuck sensors, saturation, dropped frames, or a failed calibration,
          SubStride will show a hardware error and the run should not be used for results until the setup is fixed.
        </Text>
      </View>

      <Section title="Profile">
        <MetricRow label="Display name" value={profile.displayName} />
        <MetricRow label="Weekly mileage" value={profile.weeklyMileageKm ? `${profile.weeklyMileageKm} km` : 'Not set'} />
        <MetricRow label="Body weight" value={profile.weightKg ? `${profile.weightKg} kg` : 'Not set'} />
        <MetricRow label="Data storage" value={profile.localOnly ? 'Local only' : 'Cloud enabled'} detail="Beta build keeps all runner data on device" />
      </Section>

      <Section title="Post-run context" subtitle="Saved with every session and used for baseline filtering">
        <Text style={styles.groupLabel}>Surface</Text>
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

        <Text style={styles.groupLabel}>Workout</Text>
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

        <View style={styles.stepperRow}>
          <Stepper
            label="Pain"
            value={context.painScore0To10}
            onChange={(painScore0To10) => onUpdateContext({ painScore0To10 })}
          />
          <Stepper
            label="Effort"
            value={context.perceivedEffort0To10}
            onChange={(perceivedEffort0To10) => onUpdateContext({ perceivedEffort0To10 })}
          />
        </View>
      </Section>

      <Section title="Shoes" subtitle="Shoe profiles let trends compare load by shoe">
        {shoes.map((shoe) => {
          const isActive = activeShoe?.id === shoe.id;
          return (
            <View
              key={shoe.id}
              style={[styles.shoeRow, isActive && styles.rowSelected]}
            >
              <TouchableOpacity
                style={styles.shoeSelect}
                onPress={() => onUpdateContext({ shoeId: shoe.id })}
                activeOpacity={0.8}
              >
                <View style={[styles.shoeIcon, isActive && styles.shoeIconActive]}>
                  <Text style={styles.shoeEmoji}>👟</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.shoeInfo}>
                <TextInput
                  style={styles.shoeNameInput}
                  value={shoe.name}
                  onChangeText={(name) => onRenameShoe(shoe.id, name)}
                  placeholder="Shoe name"
                  placeholderTextColor={colors.textTertiary}
                />
                <TouchableOpacity onPress={() => onUpdateContext({ shoeId: shoe.id })} activeOpacity={0.8}>
                  <Text style={styles.shoeBrand}>
                    {[shoe.brand, shoe.model, shoe.size].filter(Boolean).join(' · ') || 'Shoe profile'}
                  </Text>
                </TouchableOpacity>
              </View>
              {isActive ? (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              ) : null}
            </View>
          );
        })}
        <TouchableOpacity style={styles.addBtn} onPress={onAddShoe} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+ Add beta shoe profile</Text>
        </TouchableOpacity>
      </Section>

      <Section title="Pods" subtitle="Use simulator pods now; replace with real BLE pods when hardware is ready">
        {pods.map((pod) => (
          <View key={pod.id} style={styles.podRow}>
            <View style={styles.podInfo}>
              <Text style={styles.podName}>{pod.nickname ?? pod.serialNumber}</Text>
              <Text style={styles.podMeta}>
                {pod.assignedFoot.toUpperCase()} · {pod.serialNumber} · {CONNECTION_LABELS[pod.connection]}
              </Text>
              <Text style={styles.podMeta}>
                Battery {pod.batteryPercent ?? 0}% · RSSI {pod.rssi ?? '—'} dBm
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.connectionBtn, pod.connection === 'connected' && styles.connectionBtnActive]}
              onPress={() => onSetPodConnection(pod.id, pod.connection === 'connected' ? 'disconnected' : 'connected')}
            >
              <Text style={[styles.connectionBtnText, pod.connection === 'connected' && styles.connectionBtnTextActive]}>
                {pod.connection === 'connected' ? 'Disconnect' : 'Connect'}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </Section>

      <Section title="Export & data">
        <MetricRow label="Active shoe" value={activeShoe?.name ?? 'None'} />
        <MetricRow label="Surface" value={labelForSurface(context.surface)} />
        <MetricRow label="Workout" value={labelForWorkout(context.workoutType)} />
        <MetricRow
          label="Clear local data"
          value=""
          detail="Removes saved beta sessions and resets simulator setup"
          onPress={confirmClear}
        />
      </Section>

      <Section title="AI interpretation">
        <View style={styles.apiKeyBox}>
          <Text style={styles.apiKeyPlaceholder}>OpenAI API key not configured</Text>
        </View>
        <Text style={styles.apiNote}>
          AI summaries use computed metrics and context only. Raw pressure frames stay local in this beta build.
        </Text>
      </Section>

      <Section title="Developer mode">
        <View style={styles.devRow}>
          <View style={styles.devInfo}>
            <Text style={styles.devLabel}>Enable developer mode</Text>
            <Text style={styles.devDesc}>Unlocks simulator scenarios and validation tools</Text>
          </View>
          <Switch
            value={devMode}
            onValueChange={onToggleDevMode}
            trackColor={{ false: colors.border, true: colors.brand + '80' }}
            thumbColor={devMode ? colors.brand : colors.textTertiary}
          />
        </View>
      </Section>

      <Section title="About">
        <MetricRow label="App version" value="0.1.0 beta" />
        <MetricRow label="Analytics version" value="0.1.0" />
        <MetricRow label="Build" value="Simulator + hardware-ready BLE scaffold" />
      </Section>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          SubStride Lab metrics are experimental beta indicators and not intended for medical guidance.
        </Text>
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
          <Text style={styles.stepperBtnText}>−</Text>
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
  groupLabel: { marginBottom: 8, fontSize: 11, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  hardwareNotice: { marginBottom: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningLight },
  hardwareNoticeTitle: { fontSize: 13, fontWeight: '800', color: colors.warning },
  hardwareNoticeText: { marginTop: 4, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  tag: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.bgCardAlt, borderWidth: 1, borderColor: colors.border },
  tagSelected: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  tagText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  tagTextSelected: { color: colors.brand },
  stepperRow: { flexDirection: 'row', gap: 10 },
  stepper: { flex: 1, padding: 10, backgroundColor: colors.bgCardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stepperLabel: { fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stepperBtn: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 18, fontWeight: '800', color: colors.brand },
  stepperValue: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  shoeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, marginBottom: 8 },
  shoeSelect: { flexShrink: 0 },
  rowSelected: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  shoeIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.bgCardAlt, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  shoeIconActive: { borderColor: colors.brand, backgroundColor: colors.bgCard },
  shoeEmoji: { fontSize: 20 },
  shoeInfo: { flex: 1 },
  shoeNameInput: { minHeight: 34, padding: 0, fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  shoeBrand: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.bgCard, borderRadius: radius.full, borderWidth: 1, borderColor: colors.brandBorder },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: colors.brand },
  addBtn: { marginTop: 2, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md },
  addBtnText: { fontSize: 13, fontWeight: '700', color: colors.brand },
  podRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  podInfo: { flex: 1 },
  podName: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  podMeta: { marginTop: 2, fontSize: 11, color: colors.textTertiary },
  connectionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCardAlt },
  connectionBtnActive: { backgroundColor: colors.errorLight, borderColor: colors.errorBorder },
  connectionBtnText: { fontSize: 12, fontWeight: '800', color: colors.brand },
  connectionBtnTextActive: { color: colors.error },
  apiKeyBox: { padding: 12, backgroundColor: colors.bgCardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  apiKeyPlaceholder: { fontSize: 13, color: colors.textTertiary, fontFamily: 'monospace' },
  apiNote: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  devRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  devInfo: { flex: 1 },
  devLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  devDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  footer: { marginBottom: 20, padding: 14, alignItems: 'center' },
  footerText: { fontSize: 11, color: colors.textTertiary, textAlign: 'center', lineHeight: 16 },
});
