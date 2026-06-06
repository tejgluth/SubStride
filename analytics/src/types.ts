export type FootSide = "left" | "right" | "unknown";
export type AssignedFoot = FootSide | "unassigned";
export type CalibrationQuality = "pass" | "warn" | "fail";
export type SessionSource = "real_pod" | "simulator" | "imported";
export type SessionMode = "run" | "walk" | "treadmill" | "test" | "unknown";
export type CrcStatus = "ok" | "failed" | "missing";
export type DecodedStatus = "pending" | "decoded" | "failed";

export interface UserProfile {
  id: string;
  displayName: string;
  createdAt: string;
  heightCm?: number;
  weightKg?: number;
  weeklyMileageKm?: number;
  localOnly: boolean;
}

export interface Pod {
  id: string;
  serialNumber: string;
  nickname?: string;
  assignedFoot: AssignedFoot;
  firmwareVersion: string;
  hardwareRevision: string;
  lastSeenAt?: string;
}

export interface ShoeProfile {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  size?: string;
  notes?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  source: SessionSource;
  mode: SessionMode;
  surface?: string;
  workoutType?: string;
  shoeId?: string;
  painScore0To10?: number;
  podSessionIds: string[];
  syncStatus: "not_synced" | "partial" | "synced";
}

export interface PodSession {
  id: string;
  sessionId: string;
  podId: string;
  foot: FootSide;
  logFileName: string;
  startMonotonicMs: number;
  sampleRateEstimateHz: number;
  packetLossEstimate: number;
  crcStatus: CrcStatus;
  decodedStatus: DecodedStatus;
}

export interface RawFrame {
  sessionId: string;
  podId: string;
  foot: FootSide;
  sequence: number;
  timestampMs: number;
  pressureRaw: number[];
  accel: [number, number, number];
  gyro: [number, number, number];
  flags: number;
}

export interface RegionLoads {
  heel: number;
  midfoot: number;
  forefoot: number;
  toe: number;
  medial: number;
  center: number;
  lateral: number;
}

export interface CalibratedFrame {
  sessionId: string;
  podId: string;
  foot: FootSide;
  sequence: number;
  timestampMs: number;
  relativeLoad: number[];
  totalLoad: number;
  regionLoads: RegionLoads;
  qualityFlags: string[];
  accel: [number, number, number];
  gyro: [number, number, number];
}

export interface ZoneStats {
  offset: number;
  gain: number;
  noise: number;
  min: number;
  max: number;
  dynamicRange: number;
  flags: string[];
}

export interface CalibrationProfile {
  id: string;
  podId: string;
  foot: FootSide;
  shoeId?: string;
  createdAt: string;
  zoneOffsets: number[];
  zoneGains: number[];
  noiseStats: number[];
  quality: CalibrationQuality;
  badChannels: BadChannelFinding[];
  notes?: string;
}

export interface BadChannelFinding {
  zoneIndex: number;
  codes: string[];
  severity: CalibrationQuality;
}

export interface GaitEvent {
  type: "foot_strike" | "midstance" | "toe_off";
  timestampMs: number;
  sequence: number;
  reasonCodes: string[];
}

export interface StepSegment {
  startMs: number;
  midstanceMs: number;
  endMs: number;
  durationMs: number;
  contactTimeMs: number;
  peakLoad: number;
  impulseProxy: number;
  loadRateProxy: number;
  foot: FootSide;
}

export type ConfidenceLevel = "blocked" | "low" | "moderate" | "high";

export interface ConfidenceAssessment {
  /** Overall confidence in this run's scores. "blocked" = do NOT present a confident number. */
  level: ConfidenceLevel;
  /** Internal 0-100 confidence score (deterministic). */
  score: number;
  /** Human/code-readable reasons confidence was reduced. */
  reasonCodes: string[];
  /** Reasons that forced the level to "blocked" (empty unless blocked). */
  blocking: string[];
  /** Baseline maturity at scoring time. */
  baselineStatus: "none" | "preliminary" | "baseline_enabled" | "mature";
  /** Whether Total Training Load should be shown as a confident number. */
  scoreShowable: boolean;
}

export interface MetricValue<T = number> {
  value: T;
  units: string;
  contributingData: string[];
  reasonCodes: string[];
  limitations?: string[];
  /** Per-metric confidence, inherited from the run-level assessment unless overridden. */
  confidence?: ConfidenceLevel;
  /** Marks metrics that are not yet validated against real hardware/reference. */
  experimental?: boolean;
}

export interface CategoryScores {
  loadBalance: MetricValue;
  impactLoad: MetricValue;
  forefootMetatarsalLoad: MetricValue;
  heelLoad: MetricValue;
  archMidfootLoad: MetricValue;
  toeOffContribution: MetricValue;
  fatigueShift: MetricValue;
  shoeLoadScore: MetricValue;
}

export interface MechanicalLoadValue {
  score0To100: number;
  rawDose: number;
  dosePerMinute: number;
  dosePer1000Steps: number;
  intensity0To100: number;
  volumeFactor: number;
  components: {
    impact: number;
    loadRate: number;
    spikiness: number;
    fatigue: number;
  };
}

export interface PerceivedLoadValue {
  score0To100: number | null;
  rawRpeMinutes: number | null;
  rpe0To10: number | null;
  durationMinutes: number;
}

export interface TotalTrainingLoadValue {
  score0To100: number;
  mechanicalScore0To100: number;
  perceivedScore0To100: number | null;
  weights: {
    mechanical: number;
    perceived: number;
  };
  missingStreams: string[];
}

export interface PressureRegionPercentages extends Record<string, number> {
  heel: number;
  midfoot: number;
  forefoot: number;
  toe: number;
  medial: number;
  center: number;
  lateral: number;
}

export interface RunMetrics {
  sessionId: string;
  foot: FootSide | "both";
  cadence: MetricValue;
  contactTime: MetricValue;
  totalRelativeLoad: MetricValue;
  peakLoad: MetricValue;
  cumulativeLoad: MetricValue;
  loadRateProxy: MetricValue;
  medialLateralBalance: MetricValue;
  heelMidForeToeDistribution: MetricValue<Record<string, number>>;
  pressureRegionPercentages: MetricValue<PressureRegionPercentages>;
  impactLoad: MetricValue;
  fatigueShift: MetricValue;
  /** Beta-safe mechanical load from pressure + IMU only. */
  mechanicalLoad: MetricValue<MechanicalLoadValue>;
  /** Session RPE x duration, when supplied. */
  perceivedLoad: MetricValue<PerceivedLoadValue>;
  /** User-facing fused beta load. `trainingStrain` is kept as a numeric alias for compatibility. */
  totalTrainingLoad: MetricValue<TotalTrainingLoadValue>;
  trainingStrain: MetricValue;
  categoryScores: CategoryScores;
  /** Run-level confidence/quality gating. UI must respect confidence.scoreShowable. */
  confidence: ConfidenceAssessment;
  /** Left/right asymmetry, present only for time-aligned two-foot runs. Experimental. */
  asymmetry?: MetricValue;
  steps: StepSegment[];
}

export interface BaselineSummary {
  userId: string;
  runCount: number;
  includedRunCount: number;
  status: "preliminary" | "baseline_enabled" | "mature";
  metrics: Record<string, { mean: number; stdDev: number; sampleCount: number }>;
  excludedSessionIds: string[];
  reasonCodes: string[];
}

export interface SimulatorSession {
  id: string;
  label: string;
  scenario:
    | "normal_easy_run"
    | "fatigued_long_run"
    | "forefoot_overload"
    | "heel_impact_spike"
    | "medial_lateral_imbalance"
    | "new_old_shoe_comparison";
  simulated: true;
  notes: string;
  frames: RawFrame[];
  expectedPatterns: string[];
}
