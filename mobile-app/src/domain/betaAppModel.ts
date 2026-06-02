import {
  applyCalibration,
  buildBaseline,
  buildOpenAiExplanationPrompt,
  combineFootMetrics,
  computeRunMetrics,
  deterministicExplanation,
  generateSimulatorSession,
  makeSimulatorCalibration,
  scoreCategory,
  type BaselineInputRun,
  type BaselineSummary,
  type CalibratedFrame,
  type CalibrationProfile,
  type FootSide,
  type Pod,
  type RunMetrics,
  type Session,
  type ShoeProfile,
  type SimulatorSession,
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
  context: BetaSessionContext;
  baselineStatus: BaselineSummary['status'];
  expectedPatterns: string[];
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
  weeklyMileageKm: 32,
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

export function buildRunComputation(
  state: BetaAppState,
  scenario: SimulatorSession['scenario'],
  options: { durationSeconds?: number } = {}
): BetaRunComputation {
  const context = normalizeContext(state.sessionContext, state.shoes);
  const activeShoe = activeShoeForContext(state.shoes, context);
  const connectedPods = state.pods.filter((pod) => pod.connection === 'connected');
  const footSides = connectedFootSides(state.pods);
  const simulatedSides = footSides.length > 0 ? footSides : (['left'] as FootSide[]);
  const durationSeconds = options.durationSeconds ?? 45;

  const sideComputations = simulatedSides.map((foot) => {
    const rawSession = generateSimulatorSession(scenario, { durationSeconds, foot });
    const pod = connectedPods.find((candidate) => candidate.assignedFoot === foot);
    const podId = pod?.id ?? `SIM-${foot.toUpperCase()}`;
    const framesForPod = rawSession.frames.map((frame) => ({ ...frame, podId }));
    const calibration = makeSimulatorCalibration(podId, foot);
    const calibratedFrames = applyCalibration(framesForPod, calibration);
    const metrics = computeRunMetrics(calibratedFrames, {
      calibrationQuality: calibration.quality,
      expectedMode: context.workoutType === 'walk' ? 'walk' : context.surface === 'treadmill' ? 'treadmill' : 'run',
      shoeKnown: Boolean(activeShoe),
    });
    return { rawSession, calibration, frames: calibratedFrames, metrics };
  });

  const session = {
    ...sideComputations[0].rawSession,
    id: `sim-${scenario}-${simulatedSides.join('-')}`,
    label: sideComputations.length > 1 ? `${sideComputations[0].rawSession.label} · both feet` : sideComputations[0].rawSession.label,
    frames: sideComputations.flatMap((item) => item.rawSession.frames),
  };
  const calibrations = sideComputations.map((item) => item.calibration);
  const frames = sideComputations.flatMap((item) => item.frames).sort((a, b) => a.timestampMs - b.timestampMs || a.foot.localeCompare(b.foot));
  const metrics = sideComputations.length === 1
    ? sideComputations[0].metrics
    : combineFootMetrics(sideComputations[0].metrics, sideComputations[1].metrics);

  const baselineRuns = buildBaselineRuns(state, scenario, metrics, context);
  const baseline = buildBaseline(state.profile.id, baselineRuns);
  const metricsWithBaseline = computeRunMetrics(frames, {
    baseline,
    calibrationQuality: worstCalibrationQuality(calibrations),
    expectedMode: context.workoutType === 'walk' ? 'walk' : context.surface === 'treadmill' ? 'treadmill' : 'run',
    shoeKnown: Boolean(activeShoe),
  });
  const finalMetrics = sideComputations.length === 1 ? metricsWithBaseline : { ...metricsWithBaseline, foot: 'both' as const };

  const explanation = deterministicExplanation(finalMetrics);
  const prompt = buildOpenAiExplanationPrompt({
    metrics: finalMetrics,
    profileContext: {
      shoe: activeShoe ? [activeShoe.brand, activeShoe.model ?? activeShoe.name].filter(Boolean).join(' ') : 'Unknown shoe',
      surface: labelForSurface(context.surface),
      workoutType: labelForWorkout(context.workoutType),
    },
  });
  const sessionRecord = makeSessionRecord(state, scenario, session, finalMetrics, context, baseline);

  return {
    session,
    calibration: calibrations[0],
    calibrations,
    frames,
    metrics: finalMetrics,
    explanation,
    prompt,
    category: scoreCategory(finalMetrics.trainingStrain.value),
    baseline,
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
  scenario: SimulatorSession['scenario'],
  currentMetrics: RunMetrics,
  context: BetaSessionContext
): BaselineInputRun[] {
  const historical = state.sessionHistory
    .filter((record) => (
      record.context.shoeId === context.shoeId
      && record.context.surface === context.surface
      && record.context.workoutType === context.workoutType
    ))
    .map((record) => ({
      sessionId: record.session.id,
      userId: state.profile.id,
      metrics: record.metrics,
      calibrationQuality: 'pass' as const,
      painScore0To10: record.context.painScore0To10,
    }));

  return [
    ...historical,
    {
      sessionId: `current-${scenario}`,
      userId: state.profile.id,
      metrics: currentMetrics,
      calibrationQuality: 'pass',
      painScore0To10: context.painScore0To10,
    },
  ];
}

function makeSessionRecord(
  state: BetaAppState,
  scenario: SimulatorSession['scenario'],
  simulatorSession: SimulatorSession,
  metrics: RunMetrics,
  context: BetaSessionContext,
  baseline: BaselineSummary
): BetaSessionRecord {
  const now = new Date().toISOString();
  return {
    session: {
      id: `${simulatorSession.id}-${state.sessionHistory.length + 1}`,
      userId: state.profile.id,
      createdAt: now,
      startedAt: now,
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
    label: simulatorSession.label,
    scenario,
    metrics,
    context,
    baselineStatus: baseline.status,
    expectedPatterns: simulatorSession.expectedPatterns,
  };
}

function worstCalibrationQuality(calibrations: CalibrationProfile[]): CalibrationProfile['quality'] {
  if (calibrations.some((calibration) => calibration.quality === 'fail')) return 'fail';
  if (calibrations.some((calibration) => calibration.quality === 'warn')) return 'warn';
  return 'pass';
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}
