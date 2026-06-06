import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session as SupabaseSession, type User } from '@supabase/supabase-js';
import {
  computeLongitudinalTrainingLoad,
  type CalibrationProfile,
  type LongitudinalTrainingLoad,
  type RunMetrics,
  type ShoeProfile,
  type UserProfile,
} from '@substride/analytics';
import type { BetaPod, BetaRunComputation, BetaSessionRecord } from '../domain/betaAppModel';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
  : null;

export interface CloudAuthState {
  configured: boolean;
  session: SupabaseSession | null;
  user: User | null;
}

export type CloudSyncStatus =
  | { state: 'idle' }
  | { state: 'disabled'; reason: 'supabase_not_configured' | 'not_signed_in' }
  | { state: 'syncing' }
  | { state: 'synced'; at: string }
  | { state: 'error'; message: string };

export async function getCloudAuthState(): Promise<CloudAuthState> {
  if (!supabase) return { configured: false, session: null, user: null };
  const { data } = await supabase.auth.getSession();
  return {
    configured: true,
    session: data.session,
    user: data.session?.user ?? null,
  };
}

export function onCloudAuthStateChange(callback: (state: CloudAuthState) => void): () => void {
  if (!supabase) {
    callback({ configured: false, session: null, user: null });
    return () => undefined;
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback({
      configured: true,
      session,
      user: session?.user ?? null,
    });
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}

export async function signOutOfCloud(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function syncRunToCloud(input: {
  profile: UserProfile;
  shoes: ShoeProfile[];
  pods: BetaPod[];
  calibrations?: CalibrationProfile[];
  computation: BetaRunComputation;
}): Promise<{ skipped?: true; reason?: string; runId?: string }> {
  if (!supabase) return { skipped: true, reason: 'supabase_not_configured' };

  const user = await requireCloudUser();
  if (!user) return { skipped: true, reason: 'not_signed_in' };

  await upsertProfile(input.profile, user.id);
  await upsertShoes(input.shoes, user.id);
  await upsertPods(input.pods, user.id);
  if (input.calibrations?.length) {
    await upsertCalibrations(input.calibrations, user.id);
  }

  const runId = await upsertRunSession(input.computation.sessionRecord, user.id);
  await upsertRunMetrics(input.computation.metrics, runId, user.id);
  await upsertDecodedFramesArtifact(input.computation.sessionRecord, runId, user.id);
  await replaceTrainingLoadSnapshot(input.computation.longitudinalLoad, runId, user.id);

  return { runId };
}

export async function syncSessionHistoryToCloud(input: {
  profile: UserProfile;
  shoes: ShoeProfile[];
  pods: BetaPod[];
  calibrations?: CalibrationProfile[];
  records: BetaSessionRecord[];
}): Promise<{ skipped?: true; reason?: string; syncedCount?: number }> {
  if (!supabase) return { skipped: true, reason: 'supabase_not_configured' };

  const user = await requireCloudUser();
  if (!user) return { skipped: true, reason: 'not_signed_in' };

  await upsertProfile(input.profile, user.id);
  await upsertShoes(input.shoes, user.id);
  await upsertPods(input.pods, user.id);
  if (input.calibrations?.length) {
    await upsertCalibrations(input.calibrations, user.id);
  }

  const sortedRecords = [...input.records].sort((a, b) => sessionTime(a) - sessionTime(b));
  for (const record of sortedRecords) {
    const runId = await upsertRunSession(record, user.id);
    await upsertRunMetrics(record.metrics, runId, user.id);
    await upsertDecodedFramesArtifact(record, runId, user.id);
    const asOf = record.session.endedAt ?? record.session.startedAt ?? record.session.createdAt;
    const load = computeLongitudinalTrainingLoad(
      sortedRecords
        .filter((candidate) => sessionTime(candidate) <= sessionTime(record))
        .map((candidate) => ({
          session: candidate.session,
          metrics: candidate.metrics,
          painScore0To10: candidate.context.painScore0To10,
        })),
      { asOf }
    );
    await replaceTrainingLoadSnapshot(load, runId, user.id);
  }

  return { syncedCount: sortedRecords.length };
}

export async function uploadRunBundle(input: {
  runId: string;
  userId: string;
  clientSessionId: string;
  kind: 'raw_bundle' | 'decoded_frames' | 'firmware_log' | 'calibration_debug' | 'export';
  payload: unknown;
}): Promise<{ path: string }> {
  if (!supabase) throw new Error('Cloud sync is not configured.');

  const path = `${input.userId}/${input.clientSessionId}/${input.kind}-${Date.now()}.json`;
  const body = JSON.stringify(input.payload);
  const { error } = await supabase.storage
    .from('run-bundles')
    .upload(path, body, {
      contentType: 'application/json',
      upsert: false,
    });
  if (error) throw new Error(error.message);

  const { error: insertError } = await supabase.from('run_artifacts').insert({
    user_id: input.userId,
    run_id: input.runId,
    kind: input.kind,
    storage_bucket: 'run-bundles',
    storage_path: path,
    content_type: 'application/json',
    size_bytes: body.length,
  });
  if (insertError) throw new Error(insertError.message);

  return { path };
}

async function requireCloudUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

async function upsertProfile(profile: UserProfile, userId: string): Promise<void> {
  const { error } = await supabase!.from('profiles').upsert({
    id: userId,
    display_name: profile.displayName || 'Runner',
    height_cm: profile.heightCm ?? null,
    weight_kg: profile.weightKg ?? null,
    weekly_mileage_km: profile.weeklyMileageKm ?? null,
    local_only: false,
  });
  if (error) throw new Error(error.message);
}

async function upsertShoes(shoes: ShoeProfile[], userId: string): Promise<void> {
  if (shoes.length === 0) return;
  const { error } = await supabase!.from('shoes').upsert(
    shoes.map((shoe) => ({
      user_id: userId,
      client_shoe_id: shoe.id,
      name: shoe.name,
      brand: shoe.brand ?? null,
      model: shoe.model ?? null,
      size: shoe.size ?? null,
      notes: shoe.notes ?? null,
      created_at: shoe.createdAt,
    })),
    { onConflict: 'user_id,client_shoe_id' }
  );
  if (error) throw new Error(error.message);
}

async function upsertPods(pods: BetaPod[], userId: string): Promise<void> {
  if (pods.length === 0) return;
  const { error } = await supabase!.from('pods').upsert(
    pods.map((pod) => ({
      user_id: userId,
      client_pod_id: pod.id,
      serial_number: pod.serialNumber,
      nickname: pod.nickname ?? null,
      assigned_foot: pod.assignedFoot,
      firmware_version: pod.firmwareVersion,
      hardware_revision: pod.hardwareRevision,
      last_seen_at: pod.lastSeenAt ?? null,
      connection_state: pod.connection,
      battery_percent: pod.batteryPercent ?? null,
      rssi: pod.rssi ?? null,
    })),
    { onConflict: 'user_id,client_pod_id' }
  );
  if (error) throw new Error(error.message);
}

async function upsertCalibrations(calibrations: CalibrationProfile[], userId: string): Promise<void> {
  const { error } = await supabase!.from('calibrations').upsert(
    calibrations.map((calibration) => ({
      user_id: userId,
      client_calibration_id: calibration.id,
      client_pod_id: calibration.podId,
      client_shoe_id: calibration.shoeId ?? null,
      foot: calibration.foot,
      quality: calibration.quality,
      zone_offsets: calibration.zoneOffsets,
      zone_gains: calibration.zoneGains,
      noise_stats: calibration.noiseStats,
      bad_channels: calibration.badChannels,
      notes: calibration.notes ?? null,
      created_at: calibration.createdAt,
    })),
    { onConflict: 'user_id,client_calibration_id' }
  );
  if (error) throw new Error(error.message);
}

async function upsertRunSession(record: BetaSessionRecord, userId: string): Promise<string> {
  const { session, context } = record;
  const { data, error } = await supabase!.from('run_sessions').upsert(
    {
      user_id: userId,
      client_session_id: session.id,
      label: record.label,
      scenario: record.scenario,
      source: session.source,
      mode: session.mode,
      surface: context.surface,
      workout_type: context.workoutType,
      client_shoe_id: context.shoeId ?? null,
      pain_score_0_to_10: context.painScore0To10,
      perceived_effort_0_to_10: context.perceivedEffort0To10,
      notes: context.notes ?? null,
      baseline_status: record.baselineStatus,
      confidence_level: record.metrics.confidence.level,
      confidence_score: record.metrics.confidence.score,
      score_showable: record.metrics.confidence.scoreShowable,
      expected_patterns: record.expectedPatterns,
      sync_status: 'synced',
      started_at: session.startedAt ?? null,
      ended_at: session.endedAt ?? null,
      created_at: session.createdAt,
    },
    { onConflict: 'user_id,client_session_id' }
  ).select('id').single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

async function upsertRunMetrics(metrics: RunMetrics, runId: string, userId: string): Promise<void> {
  const mechanical = metrics.mechanicalLoad.value;
  const perceived = metrics.perceivedLoad.value;
  const total = metrics.totalTrainingLoad.value;
  const { error } = await supabase!.from('run_metrics').upsert({
    run_id: runId,
    user_id: userId,
    total_training_load_score: total.score0To100,
    mechanical_load_score: mechanical.score0To100,
    perceived_load_score: perceived.score0To100,
    mechanical_raw_dose: mechanical.rawDose,
    mechanical_dose_per_minute: mechanical.dosePerMinute,
    mechanical_dose_per_1000_steps: mechanical.dosePer1000Steps,
    perceived_rpe_minutes: perceived.rawRpeMinutes,
    cadence: numberMetric(metrics.cadence.value),
    contact_time_ms: numberMetric(metrics.contactTime.value),
    total_relative_load: numberMetric(metrics.totalRelativeLoad.value),
    peak_load: numberMetric(metrics.peakLoad.value),
    cumulative_load: numberMetric(metrics.cumulativeLoad.value),
    load_rate_proxy: numberMetric(metrics.loadRateProxy.value),
    impact_proxy: numberMetric(metrics.impactLoad.value),
    fatigue_shift: numberMetric(metrics.fatigueShift.value),
    medial_lateral_balance: numberMetric(metrics.medialLateralBalance.value),
    category_scores: metrics.categoryScores,
    distribution: metrics.heelMidForeToeDistribution.value,
    confidence: metrics.confidence,
    metrics_payload: metrics,
  });
  if (error) throw new Error(error.message);
}

async function upsertDecodedFramesArtifact(record: BetaSessionRecord, runId: string, userId: string): Promise<void> {
  if (!record.frames?.length) return;
  const storagePath = `${userId}/${record.session.id}/decoded_frames.json`;
  const payload = {
    clientSessionId: record.session.id,
    generatedAt: new Date().toISOString(),
    frameCount: record.frames.length,
    frames: record.frames,
  };
  const body = JSON.stringify(payload);
  const { error: uploadError } = await supabase!.storage
    .from('run-bundles')
    .upload(storagePath, body, {
      contentType: 'application/json',
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase!.from('run_artifacts').upsert({
    user_id: userId,
    run_id: runId,
    kind: 'decoded_frames',
    storage_bucket: 'run-bundles',
    storage_path: storagePath,
    content_type: 'application/json',
    size_bytes: body.length,
  }, { onConflict: 'storage_bucket,storage_path' });
  if (error) throw new Error(error.message);
}

async function replaceTrainingLoadSnapshot(load: LongitudinalTrainingLoad, runId: string, userId: string): Promise<void> {
  const { error: deleteError } = await supabase!.from('training_load_snapshots')
    .delete()
    .eq('user_id', userId)
    .eq('run_id', runId);
  if (deleteError) throw new Error(deleteError.message);

  const { error } = await supabase!.from('training_load_snapshots').insert({
    user_id: userId,
    run_id: runId,
    computed_at: load.asOf,
    status: load.status,
    current_load_score: load.currentLoadScore0To100,
    mechanical_atl: load.mechanical.acute,
    mechanical_ctl: load.mechanical.chronic,
    perceived_atl: load.perceived.acute,
    perceived_ctl: load.perceived.chronic,
    total_atl: load.total.acute,
    total_ctl: load.total.chronic,
    acute_chronic_ratio: load.total.acuteChronicRatio,
    tolerance_28d: load.total.tolerance28d,
    monotony_7d: load.monotony7d,
    strain_7d: load.trainingStrain7d,
    risk_level: load.riskSignal.level === 'blocked'
      ? 'not_available'
      : load.riskSignal.level === 'high'
        ? 'elevated'
        : load.riskSignal.level,
    risk_score: load.riskSignal.value0To100,
    risk_reasons: load.riskSignal.reasonCodes,
    payload: load,
  });
  if (error) throw new Error(error.message);
}

function numberMetric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sessionTime(record: BetaSessionRecord): number {
  const value = record.session.endedAt ?? record.session.startedAt ?? record.session.createdAt;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
