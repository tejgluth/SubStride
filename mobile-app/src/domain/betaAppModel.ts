import {
  applyCalibration,
  buildBaseline,
  buildOpenAiExplanationPrompt,
  combineFootMetrics,
  computeRunMetrics,
  computeLongitudinalTrainingLoad,
  deterministicExplanation,
  generateSimulatorSession,
  makeSimulatorCalibration,
  scoreCategory,
  type BaselineInputRun,
  type BaselineSummary,
  type CalibratedFrame,
  type CalibrationProfile,
  type FootSide,
  type RunSummaryAndSuggestionsContent,
  type Pod,
  type RunMetrics,
  type Session,
  type ShoeProfile,
  type SimulatorSession,
  type LongitudinalTrainingLoad,
  type UserProfile,
} from '@substride/analytics';

export type SurfaceTag = 'treadmill' | 'road' | 'trail' | 'track' | 'grass' | 'mixed';
export type WorkoutTag = 'easy_run' | 'long_run' | 'tempo' | 'intervals' | 'recovery' | 'walk' | 'test';
export type BetaPodConnection = 'connected' | 'available' | 'disconnected';

export interface BetaPod extends Pod {
  connection: BetaPodConnection;
  batteryPercent?: number;
  rssi?: number;
  lastSyncAt?: string;
}

export interface BetaSessionContext {
  surface: SurfaceTag;
  workoutType: WorkoutTag;
  shoeId?: string;
  painScore0To10: number;
  perceivedEffort0To10: number;
  notes?: string;
}

export interface BetaSessionRecord {
  session: Session;
  label: string;
  scenario: SimulatorSession['scenario'];
  metrics: RunMetrics;
  frames?: CalibratedFrame[];
  context: BetaSessionContext;
  baselineStatus: BaselineSummary['status'];
  expectedPatterns: string[];
  aiSummary?: {
    requestKey: string;
    promptVersion: string;
    generatedAt: string;
    source: 'local' | 'cloud';
    content: RunSummaryAndSuggestionsContent;
  };
}

export interface BetaRunComputation {
  session: SimulatorSession;
  calibration: CalibrationProfile;
  calibrations: CalibrationProfile[];
  frames: CalibratedFrame[];
  metrics: RunMetrics;
  explanation: string;
  prompt: ReturnType<typeof buildOpenAiExplanationPrompt>;
  category: ReturnType<typeof scoreCategory>;
  baseline: BaselineSummary;
  longitudinalLoad: LongitudinalTrainingLoad;
  context: BetaSessionContext;
  activeShoe?: ShoeProfile;
  connectedPods: BetaPod[];
  sessionRecord: BetaSessionRecord;
  history: BetaSessionRecord[];
}

export interface BetaAppState {
  profile: UserProfile;
  shoes: ShoeProfile[];
  pods: BetaPod[];
  sessionContext: BetaSessionContext;
  sessionHistory: BetaSessionRecord[];
}

export const SURFACE_OPTIONS: Array<{ id: SurfaceTag; label: string }> = [
  { id: 'treadmill', label: 'Treadmill' },
  { id: 'road', label: 'Road' },
  { id: 'trail', label: 'Trail' },
  { id: 'track', label: 'Track' },
  { id: 'grass', label: 'Grass' },
  { id: 'mixed', label: 'Mixed' },
];

export const WORKOUT_OPTIONS: Array<{ id: WorkoutTag; label: string }> = [
  { id: 'easy_run', label: 'Easy run' },
  { id: 'long_run', label: 'Long run' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'intervals', label: 'Intervals' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'walk', label: 'Walk' },
  { id: 'test', label: 'Hardware test' },
];

const DEFAULT_PROFILE: UserProfile = {
  id: 'local-runner',
  displayName: 'Runner',
  createdAt: '2026-01-01T00:00:00.000Z',
  localOnly: true,
};

const DEFAULT_SHOES: ShoeProfile[] = [
  {
    id: 'sim-shoe-1',
    name: 'Daily trainer',
    brand: 'SubStride',
    model: 'Simulator',
    size: 'Beta',
    createdAt: '2026-01-01T00:00:00.000Z',
    notes: 'Default simulator shoe used until real shoe profiles are added.',
  },
];

const DEFAULT_PODS: BetaPod[] = [
  {
    id: 'SIM-LEFT',
    serialNumber: 'SIM-LEFT',
    nickname: 'Left pod',
    assignedFoot: 'left',
    firmwareVersion: 'sim-0.1.0',
    hardwareRevision: 'sim-v0',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    connection: 'connected',
    batteryPercent: 93,
    rssi: -48,
  },
  {
    id: 'SIM-RIGHT',
    serialNumber: 'SIM-RIGHT',
    nickname: 'Right pod',
    assignedFoot: 'right',
    firmwareVersion: 'sim-0.1.0',
    hardwareRevision: 'sim-v0',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    connection: 'connected',
    batteryPercent: 91,
    rssi: -51,
  },
];

export function createDefaultSessionContext(shoeId = DEFAULT_SHOES[0]?.id): BetaSessionContext {
  return {
    surface: 'treadmill',
    workoutType: 'easy_run',
    shoeId,
    painScore0To10: 0,
    perceivedEffort0To10: 4,
    notes: '',
  };
}

export function createDefaultBetaAppState(): BetaAppState {
  return {
    profile: DEFAULT_PROFILE,
    shoes: DEFAULT_SHOES,
    pods: DEFAULT_PODS,
    sessionContext: createDefaultSessionContext(DEFAULT_SHOES[0]?.id),
    sessionHistory: [],
  };
}

export function labelForSurface(surface: SurfaceTag): string {
  return SURFACE_OPTIONS.find((option) => option.id === surface)?.label ?? surface;
}

export function labelForWorkout(workoutType: WorkoutTag): string {
  return WORKOUT_OPTIONS.find((option) => option.id === workoutType)?.label ?? workoutType;
}

export function runNameForContext(context: Pick<BetaSessionContext, 'workoutType'>): string {
  return labelForWorkout(context.workoutType);
}

export function activeShoeForContext(shoes: ShoeProfile[], context: BetaSessionContext): ShoeProfile | undefined {
  return shoes.find((shoe) => shoe.id === context.shoeId) ?? shoes[0];
}

export function connectedFootSides(pods: BetaPod[]): FootSide[] {
  const sides = pods
    .filter((pod) => pod.connection === 'connected' && (pod.assignedFoot === 'left' || pod.assignedFoot === 'right'))
    .map((pod) => pod.assignedFoot as FootSide);
  return [...new Set(sides)];
}

export function connectionSummary(pods: BetaPod[]): { connectedCount: number; leftConnected: boolean; rightConnected: boolean; mode: 'no_pods' | 'one_pod' | 'two_pods' } {
  const sides = connectedFootSides(pods);
  const leftConnected = sides.includes('left');
  const rightConnected = sides.includes('right');
  const connectedCount = sides.length;
  return {
    connectedCount,
    leftConnected,
    rightConnected,
    mode: connectedCount >= 2 ? 'two_pods' : connectedCount === 1 ? 'one_pod' : 'no_pods',
  };
}

export function setPodConnection(pods: BetaPod[], podId: string, connection: BetaPodConnection): BetaPod[] {
  const now = new Date().toISOString();
  return pods.map((pod) => (
    pod.id === podId
      ? { ...pod, connection, lastSeenAt: connection === 'connected' ? now : pod.lastSeenAt }
      : pod
  ));
}

export function addShoeProfile(shoes: ShoeProfile[], input?: Partial<ShoeProfile>): ShoeProfile {
  const id = input?.id ?? `shoe-${shoes.length + 1}`;
  return {
    id,
    name: input?.name ?? `Shoe ${shoes.length + 1}`,
    brand: input?.brand ?? 'Runner',
    model: input?.model ?? 'Beta profile',
    size: input?.size,
    notes: input?.notes,
    createdAt: input?.createdAt ?? new Date().toISOString(),
  };
}

export function framesForSessionRecord(record: BetaSessionRecord, pods: BetaPod[]): CalibratedFrame[] {
  if (record.frames?.length) return record.frames;
  if (record.session.source !== 'simulator') return [];

  const durationSeconds = durationSecondsForRecord(record);
  const footSides = footSidesForRecord(record, pods);
  return footSides.flatMap((foot) => {
    const rawSession = generateSimulatorSession(record.scenario, { durationSeconds, foot });
    const pod = pods.find((candidate) => candidate.assignedFoot === foot);
    const podId = pod?.id ?? `SIM-${foot.toUpperCase()}`;
    const framesForPod = rawSession.frames.map((frame) => ({
      ...frame,
      sessionId: record.session.id,
      podId,
    }));
    return applyCalibration(framesForPod, makeSimulatorCalibration(podId, foot));
  }).sort((a, b) => a.timestampMs - b.timestampMs || a.foot.localeCompare(b.foot));
}

export function buildRunComputation(
  state: BetaAppState,
  scenario: SimulatorSession['scenario'],
  options: { durationSeconds?: number; asOf?: string | Date | number } = {}
): BetaRunComputation {
  const context = normalizeContext(state.sessionContext, state.shoes);
  const activeShoe = activeShoeForContext(state.shoes, context);
  const connectedPods = state.pods.filter((pod) => pod.connection === 'connected');
  const footSides = connectedFootSides(state.pods);
  const simulatedSides = footSides.length > 0 ? footSides : (['left'] as FootSide[]);
  const durationSeconds = options.durationSeconds ?? 45;
  const asOf = options.asOf ?? new Date();
  const runName = runNameForContext(context);

  const expectedMode = context.workoutType === 'walk' ? 'walk' : context.surface === 'treadmill' ? 'treadmill' : 'run';
  const sideComputations = simulatedSides.map((foot) => {
    const rawSession = generateSimulatorSession(scenario, { durationSeconds, foot });
    const pod = connectedPods.find((candidate) => candidate.assignedFoot === foot);
    const podId = pod?.id ?? `SIM-${foot.toUpperCase()}`;
    const framesForPod = rawSession.frames.map((frame) => ({ ...frame, podId }));
    const calibration = makeSimulatorCalibration(podId, foot);
    const calibratedFrames = applyCalibration(framesForPod, calibration);
    return { rawSession, calibration, frames: calibratedFrames };
  });

  const session = {
    ...sideComputations[0].rawSession,
    id: `sim-${scenario}-${simulatedSides.join('-')}`,
    label: runName,
    frames: sideComputations.flatMap((item) => item.rawSession.frames),
  };
  const calibrations = sideComputations.map((item) => item.calibration);
  const frames = sideComputations.flatMap((item) => item.frames).sort((a, b) => a.timestampMs - b.timestampMs || a.foot.localeCompare(b.foot));

  const baselineRuns = buildBaselineRuns(state, context);
  const baseline = buildBaseline(state.profile.id, baselineRuns);
  // Apply the baseline PER FOOT and then combine. The previous code recomputed gait/metrics on the
  // two feet's frames interleaved into one timeline, which corrupts gait-event detection (the
  // total-load signal jumps between feet). Each foot must be analysed independently, then combined.
  const sideMetricsWithBaseline = sideComputations.map((item) =>
    computeRunMetrics(item.frames, {
      baseline,
      calibrationQuality: item.calibration.quality,
      badChannelCount: item.calibration.badChannels.length,
      expectedMode,
      shoeKnown: Boolean(activeShoe),
      perceivedEffort0To10: context.perceivedEffort0To10,
    })
  );
  const finalMetrics = sideMetricsWithBaseline.length === 1
    ? sideMetricsWithBaseline[0]
    : combineFootMetrics(sideMetricsWithBaseline[0], sideMetricsWithBaseline[1]);

  const explanation = deterministicExplanation(finalMetrics);
  const prompt = buildOpenAiExplanationPrompt({
    metrics: finalMetrics,
    profileContext: {
      runName,
      shoe: activeShoe?.name ?? 'Unknown shoe',
      surface: labelForSurface(context.surface),
      workoutType: labelForWorkout(context.workoutType),
    },
  });
  const sessionRecord = makeSessionRecord(state, scenario, session, finalMetrics, frames, context, baseline, asOf, durationSeconds);
  const longitudinalLoad = computeLongitudinalTrainingLoad(
    [...state.sessionHistory, sessionRecord].map((record) => ({
      session: record.session,
      metrics: record.metrics,
      painScore0To10: record.context.painScore0To10,
    })),
    { asOf }
  );

  return {
    session,
    calibration: calibrations[0],
    calibrations,
    frames,
    metrics: finalMetrics,
    explanation,
    prompt,
    category: scoreCategory(finalMetrics.totalTrainingLoad.value.score0To100),
    baseline,
    longitudinalLoad,
    context,
    activeShoe,
    connectedPods,
    sessionRecord,
    history: [...state.sessionHistory, sessionRecord],
  };
}

export function normalizeContext(context: BetaSessionContext, shoes: ShoeProfile[]): BetaSessionContext {
  const shoeId = shoes.some((shoe) => shoe.id === context.shoeId) ? context.shoeId : shoes[0]?.id;
  return {
    ...context,
    shoeId,
    painScore0To10: clampInt(context.painScore0To10, 0, 10),
    perceivedEffort0To10: clampInt(context.perceivedEffort0To10, 0, 10),
  };
}

function buildBaselineRuns(
  state: BetaAppState,
  context: BetaSessionContext
): BaselineInputRun[] {
  const cleanHistory = state.sessionHistory.filter((record) => (
    record.metrics.confidence.scoreShowable
    && record.context.painScore0To10 <= 3
  ));
  const tiers: Array<{ minimum: number; records: BetaSessionRecord[] }> = [
    {
      minimum: 7,
      records: cleanHistory.filter((record) => (
        record.context.shoeId === context.shoeId
        && record.context.surface === context.surface
        && record.context.workoutType === context.workoutType
      )),
    },
    {
      minimum: 5,
      records: cleanHistory.filter((record) => (
        record.context.shoeId === context.shoeId
        && record.context.workoutType === context.workoutType
      )),
    },
    {
      minimum: 5,
      records: cleanHistory.filter((record) => (
        record.context.surface === context.surface
        && record.context.workoutType === context.workoutType
      )),
    },
    {
      minimum: 3,
      records: cleanHistory.filter((record) => record.context.workoutType === context.workoutType),
    },
    {
      minimum: 0,
      records: cleanHistory,
    },
  ];
  const selected = tiers.find((tier) => tier.records.length >= tier.minimum)?.records ?? [];
  return selected.map((record) => ({
    sessionId: record.session.id,
    userId: state.profile.id,
    metrics: record.metrics,
    calibrationQuality: 'pass' as const,
    painScore0To10: record.context.painScore0To10,
  }));
}

function durationSecondsForRecord(record: BetaSessionRecord): number {
  const startedAt = record.session.startedAt ? new Date(record.session.startedAt).getTime() : NaN;
  const endedAt = record.session.endedAt ? new Date(record.session.endedAt).getTime() : NaN;
  if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt) {
    return Math.max(1, Math.round((endedAt - startedAt) / 1000));
  }
  return 45;
}

function footSidesForRecord(record: BetaSessionRecord, pods: BetaPod[]): FootSide[] {
  const fromPodSessionIds = (['left', 'right'] as FootSide[]).filter((foot) => (
    record.session.podSessionIds.some((id) => id.toLowerCase().includes(foot))
  ));
  if (fromPodSessionIds.length > 0) return fromPodSessionIds;
  if (record.metrics.foot === 'both') return ['left', 'right'];
  if (record.metrics.foot === 'left' || record.metrics.foot === 'right') return [record.metrics.foot];
  const connected = connectedFootSides(pods);
  return connected.length > 0 ? connected : ['left'];
}

function makeSessionRecord(
  state: BetaAppState,
  scenario: SimulatorSession['scenario'],
  simulatorSession: SimulatorSession,
  metrics: RunMetrics,
  frames: CalibratedFrame[],
  context: BetaSessionContext,
  baseline: BaselineSummary,
  asOf: string | Date | number,
  durationSeconds: number
): BetaSessionRecord {
  const endedAtMs = new Date(asOf).getTime();
  const safeEndedAtMs = Number.isFinite(endedAtMs) ? endedAtMs : Date.now();
  const now = new Date(safeEndedAtMs).toISOString();
  const startedAt = new Date(safeEndedAtMs - Math.max(0, durationSeconds) * 1000).toISOString();
  return {
    session: {
      id: `${simulatorSession.id}-${state.sessionHistory.length + 1}`,
      userId: state.profile.id,
      createdAt: now,
      startedAt,
      endedAt: now,
      source: 'simulator',
      mode: context.workoutType === 'walk' ? 'walk' : context.surface === 'treadmill' ? 'treadmill' : 'run',
      surface: context.surface,
      workoutType: context.workoutType,
      shoeId: context.shoeId,
      painScore0To10: context.painScore0To10,
      podSessionIds: connectedFootSides(state.pods).map((foot) => `sim-${foot}-${state.sessionHistory.length + 1}`),
      syncStatus: 'synced',
    },
    label: runNameForContext(context),
    scenario,
    metrics,
    frames,
    context,
    baselineStatus: baseline.status,
    expectedPatterns: simulatorSession.expectedPatterns,
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}
