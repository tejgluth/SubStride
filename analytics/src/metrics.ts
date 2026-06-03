import type {
  BaselineSummary,
  CalibratedFrame,
  ConfidenceAssessment,
  ConfidenceLevel,
  FootSide,
  MechanicalLoadValue,
  MetricValue,
  PerceivedLoadValue,
  RunMetrics,
  StepSegment,
  TotalTrainingLoadValue,
} from "./types";
import { segmentSteps } from "./gait";

export interface ComputeMetricsOptions {
  baseline?: BaselineSummary;
  calibrationQuality?: "pass" | "warn" | "fail";
  expectedMode?: "run" | "walk" | "treadmill" | "test" | "unknown";
  shoeKnown?: boolean;
  /** Fraction (0-1) of frames lost in sync, from the decode/import layer. */
  packetLossEstimate?: number;
  /** Number of bad channels reported by calibration (for confidence). */
  badChannelCount?: number;
  /** Session RPE/effort, 0-10. Used for beta Perceived Load when provided. */
  perceivedEffort0To10?: number | null;
}

/** Minimum detected steps before a run can produce a confident Total Training Load. */
export const MIN_STEPS_FOR_SCORE = 8;
/** Minimum run duration (s) before scoring. */
export const MIN_DURATION_SECONDS_FOR_SCORE = 15;

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function metric(
  value: number,
  units: string,
  contributingData: string[],
  reasonCodes: string[],
  limitations: string[] = [],
  extra: { confidence?: ConfidenceLevel; experimental?: boolean } = {}
): MetricValue {
  return { value, units, contributingData, reasonCodes, limitations, ...extra };
}

function structuredMetric<T>(
  value: T,
  units: string,
  contributingData: string[],
  reasonCodes: string[],
  limitations: string[] = [],
  extra: { confidence?: ConfidenceLevel; experimental?: boolean } = {}
): MetricValue<T> {
  return { value, units, contributingData, reasonCodes, limitations, ...extra };
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { blocked: 0, low: 1, moderate: 2, high: 3 };

export function worseConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

/**
 * Deterministic run-level confidence. Hard blocks (calibration failed, too few steps, too short,
 * heavy packet loss) force "blocked" so the UI will not present a confident Total Training Load.
 * Softer issues reduce the level. This is the gate the prompt requires: low-quality data never
 * yields a precise-looking score.
 */
export function computeConfidence(input: {
  calibrationQuality: "pass" | "warn" | "fail";
  stepCount: number;
  durationSeconds: number;
  measuredSampleRateHz: number | null;
  expectedSampleRateHz?: number;
  packetLossEstimate: number;
  badChannelCount: number;
  highLoadFlagFraction: number;
  leftFootUnverified: boolean;
  singleFoot: boolean;
  baselineStatus: ConfidenceAssessment["baselineStatus"];
}): ConfidenceAssessment {
  const reasonCodes: string[] = [];
  const blocking: string[] = [];
  let score = 100;

  if (input.calibrationQuality === "fail") {
    blocking.push("calibration_failed");
  } else if (input.calibrationQuality === "warn") {
    score -= 25;
    reasonCodes.push("calibration_warning");
  }
  if (input.stepCount < MIN_STEPS_FOR_SCORE) {
    blocking.push("insufficient_steps");
  } else if (input.stepCount < MIN_STEPS_FOR_SCORE * 2) {
    score -= 20;
    reasonCodes.push("short_run_few_steps");
  }
  if (input.durationSeconds < MIN_DURATION_SECONDS_FOR_SCORE) {
    blocking.push("run_too_short");
  }
  if (input.packetLossEstimate > 0.5) {
    blocking.push("severe_packet_loss");
  } else if (input.packetLossEstimate > 0.1) {
    score -= Math.round(input.packetLossEstimate * 60);
    reasonCodes.push("elevated_packet_loss");
  }
  if (input.badChannelCount > 2) {
    blocking.push("too_many_bad_channels");
  } else if (input.badChannelCount > 0) {
    score -= input.badChannelCount * 12;
    reasonCodes.push("bad_channels_present");
  }
  if (input.highLoadFlagFraction > 0.05) {
    score -= 20;
    reasonCodes.push("frequent_saturation_or_high_load");
  }
  if (input.measuredSampleRateHz !== null && input.expectedSampleRateHz) {
    const deviation = Math.abs(input.measuredSampleRateHz - input.expectedSampleRateHz) / input.expectedSampleRateHz;
    if (deviation > 0.2) {
      score -= 15;
      reasonCodes.push("sample_rate_off_target");
    }
  }
  if (input.leftFootUnverified) {
    score -= 15;
    reasonCodes.push("left_foot_orientation_unverified");
  }
  if (input.singleFoot) {
    score -= 10;
    reasonCodes.push("single_foot_no_asymmetry");
  }
  if (input.baselineStatus === "none" || input.baselineStatus === "preliminary") {
    reasonCodes.push("baseline_not_mature");
  }

  let level: ConfidenceLevel;
  if (blocking.length > 0) {
    level = "blocked";
    score = Math.min(score, 0);
  } else if (score >= 75) {
    level = "high";
  } else if (score >= 50) {
    level = "moderate";
  } else {
    level = "low";
  }

  return {
    level,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasonCodes,
    blocking,
    baselineStatus: input.baselineStatus,
    scoreShowable: level !== "blocked",
  };
}

function balanceScore(medial: number, lateral: number): number {
  const total = medial + lateral;
  if (total <= 0) return 50;
  return clampScore(100 - Math.abs((medial - lateral) / total) * 160);
}

function ratio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function durationMinutes(frames: CalibratedFrame[]): number {
  if (frames.length < 2) return 0;
  return Math.max(0, frames[frames.length - 1].timestampMs - frames[0].timestampMs) / 60000;
}

function normalizedRpe(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, value));
}

function perceivedLoadScore(rawRpeMinutes: number | null, baseline?: BaselineSummary): { score: number | null; reasonCodes: string[] } {
  if (rawRpeMinutes == null) return { score: null, reasonCodes: ["perceived_load_missing"] };
  const entry = baseline?.metrics.perceivedLoadRaw;
  if (entry && entry.mean > 0 && entry.sampleCount >= 3) {
    return {
      score: clampScore((rawRpeMinutes / entry.mean) * 50),
      reasonCodes: ["rpe_minutes", "baseline_normalized"],
    };
  }
  // Conservative cold-start scale: RPE 5 for 50 minutes maps near 50; RPE 10 for 50+ minutes saturates.
  return { score: clampScore(rawRpeMinutes / 5), reasonCodes: ["rpe_minutes", "cold_start_scale"] };
}

function fuseTrainingLoad(input: {
  mechanicalScore: number;
  perceivedScore: number | null;
}): TotalTrainingLoadValue {
  if (input.perceivedScore == null) {
    return {
      score0To100: input.mechanicalScore,
      mechanicalScore0To100: input.mechanicalScore,
      perceivedScore0To100: null,
      weights: { mechanical: 1, perceived: 0 },
      missingStreams: ["perceived"],
    };
  }
  const weights = { mechanical: 0.75, perceived: 0.25 };
  return {
    score0To100: clampScore(input.mechanicalScore * weights.mechanical + input.perceivedScore * weights.perceived),
    mechanicalScore0To100: input.mechanicalScore,
    perceivedScore0To100: input.perceivedScore,
    weights,
    missingStreams: [],
  };
}

export function computeRunMetrics(frames: CalibratedFrame[], options: ComputeMetricsOptions = {}): RunMetrics {
  if (frames.length === 0) {
    throw new Error("Cannot compute metrics from an empty frame set");
  }

  const calibrationQuality = options.calibrationQuality ?? "pass";
  const steps = segmentSteps(frames);
  const minutes = durationMinutes(frames);
  const durationSeconds = minutes * 60;
  const totalLoads = frames.map((frame) => frame.totalLoad);
  const stepPeaks = steps.map((step) => step.peakLoad);
  const peakLoads = steps.length ? stepPeaks : totalLoads;
  const impulses = steps.map((step) => step.impulseProxy);
  const loadRates = steps.map((step) => step.loadRateProxy);
  const regionTotals = frames.reduce(
    (acc, frame) => {
      acc.heel += frame.regionLoads.heel;
      acc.midfoot += frame.regionLoads.midfoot;
      acc.forefoot += frame.regionLoads.forefoot;
      acc.toe += frame.regionLoads.toe;
      acc.medial += frame.regionLoads.medial;
      acc.center += frame.regionLoads.center;
      acc.lateral += frame.regionLoads.lateral;
      return acc;
    },
    { heel: 0, midfoot: 0, forefoot: 0, toe: 0, medial: 0, center: 0, lateral: 0 }
  );
  const allRegionLoad = regionTotals.heel + regionTotals.midfoot + regionTotals.forefoot + regionTotals.toe;
  const firstHalf = frames.slice(0, Math.floor(frames.length / 2));
  const secondHalf = frames.slice(Math.floor(frames.length / 2));
  const firstForefootRatio = ratio(firstHalf.reduce((sum, frame) => sum + frame.regionLoads.forefoot + frame.regionLoads.toe, 0), firstHalf.reduce((sum, frame) => sum + frame.totalLoad, 0));
  const secondForefootRatio = ratio(secondHalf.reduce((sum, frame) => sum + frame.regionLoads.forefoot + frame.regionLoads.toe, 0), secondHalf.reduce((sum, frame) => sum + frame.totalLoad, 0));
  // Signed = directional (forefoot load INCREASING into the run is the fatigue signal). Magnitude
  // is reported for back-compat, but only the positive direction drives Mechanical Load.
  const forefootShiftSigned = (secondForefootRatio - firstForefootRatio) * 100;
  const fatigueShiftValue = Math.abs(forefootShiftSigned);

  // Actual sample rate from timestamps (not assumed). Feeds confidence + UI.
  const spanMs = frames.length > 1 ? frames[frames.length - 1].timestampMs - frames[0].timestampMs : 0;
  const measuredSampleRateHz = spanMs > 0 ? Math.round(((frames.length - 1) / (spanMs / 1000)) * 10) / 10 : null;

  const cadenceValue = minutes > 0 ? steps.length / minutes : 0;
  const contactTimeValue = mean(steps.map((step) => step.contactTimeMs));
  const totalRelativeLoadValue = totalLoads.reduce((sum, value) => sum + value, 0);
  const peakLoadValue = percentile(peakLoads, 0.95);
  const cumulativeLoadValue = impulses.reduce((sum, value) => sum + value, 0);
  const loadRateValue = percentile(loadRates, 0.9);
  const medianStepPeak = median(stepPeaks);
  const medialLateralBalanceValue = balanceScore(regionTotals.medial, regionTotals.lateral);
  // Rotation-invariant impact proxy: deviation of accel MAGNITUDE from 1 g. Unlike (accel_z - 1),
  // this does not assume the lace-mounted IMU's Z axis is vertical. Units: g over 1 g. EXPERIMENTAL.
  const accelImpactG = percentile(
    frames.map((frame) => Math.abs(Math.hypot(frame.accel[0], frame.accel[1], frame.accel[2]) - 1)),
    0.99
  );
  const forefootRatio = ratio(regionTotals.forefoot + regionTotals.toe, allRegionLoad);
  const heelRatio = ratio(regionTotals.heel, allRegionLoad);
  const midfootRatio = ratio(regionTotals.midfoot, allRegionLoad);
  const toeRatio = ratio(regionTotals.toe, allRegionLoad);

  // --- Mechanical Load: gain-invariant intensity x baseline volume factor ---
  // All absolute pressure magnitudes scale with calibration gain, so they must NOT enter the
  // score directly (the old formula was tuned to the simulator's gain=1 and broke on real
  // calibration). Instead we use only dimensionless / gain-cancelling quantities, plus the
  // absolute (gain-free) IMU g signal, and anchor volume to the personal baseline.
  const eps = 1e-6;
  const peakToMedian = medianStepPeak > eps ? peakLoadValue / medianStepPeak : 1; // dimensionless spikiness
  const loadRateRatio = peakLoadValue > eps ? loadRateValue / peakLoadValue : 0;   // 1/s, gain cancels
  const impactComponent = clamp01(accelImpactG / 1.2);                 // ~1.2 g deviation = max (TUNE on hw)
  const loadRateComponent = clamp01(loadRateRatio / 20);               // 20 /s = very fast loading (TUNE)
  const spikinessComponent = clamp01((peakToMedian - 1) / 0.6);        // 1.6x median peak = max (TUNE)
  const fatigueComponent = clamp01(Math.max(0, forefootShiftSigned) / 12); // +12 pp forefoot shift = max (TUNE)
  const intensity =
    0.35 * impactComponent + 0.25 * loadRateComponent + 0.2 * spikinessComponent + 0.2 * fatigueComponent;
  const baseIntensityScore = intensity * 100;

  // Volume factor compares load PER STEP to the personal baseline. Per-step (not total) is used so
  // the factor is invariant to foot count: combining two feet sums both cumulative load AND steps,
  // so per-step stays on the same scale as a single-foot run and a per-foot baseline comparison is
  // valid. (The old factor compared a total load-sum to the mean Training Strain alias — a unit mismatch.)
  const cumulativePerStep = cumulativeLoadValue / Math.max(1, steps.length);
  const baselinePerStep = options.baseline?.metrics.cumulativeLoadPerStep?.mean;
  const baselinePerStepSamples = options.baseline?.metrics.cumulativeLoadPerStep?.sampleCount ?? 0;
  const mechanicalReasonCodes = ["gain_invariant_intensity"];
  let volumeFactor = 1;
  if (baselinePerStep && baselinePerStep > 0 && baselinePerStepSamples >= 3) {
    const ratioToBaseline = cumulativePerStep / baselinePerStep;
    volumeFactor = Math.max(0.6, Math.min(1.6, ratioToBaseline)); // bounded; no single run dominates
    mechanicalReasonCodes.push("baseline_volume_adjusted");
  } else {
    mechanicalReasonCodes.push("no_baseline_volume_neutral");
  }
  const mechanicalLoadScore = clampScore(baseIntensityScore * volumeFactor);

  const rpe0To10 = normalizedRpe(options.perceivedEffort0To10);
  const rawRpeMinutes = rpe0To10 == null ? null : rpe0To10 * minutes;
  const perceivedScoring = perceivedLoadScore(rawRpeMinutes, options.baseline);
  const totalTrainingLoadValue = fuseTrainingLoad({
    mechanicalScore: mechanicalLoadScore,
    perceivedScore: perceivedScoring.score,
  });

  // --- Confidence gating ---
  const highLoadFlagFraction =
    frames.filter((frame) => frame.qualityFlags.some((flag) => flag.includes("high_load") || flag === "calibration_failed")).length /
    Math.max(1, frames.length);
  const leftFootUnverified = frames.some((frame) => frame.qualityFlags.includes("left_foot_orientation_unverified"));
  const singleFoot = new Set(frames.map((frame) => frame.foot)).size <= 1;
  const baselineStatusForConfidence: ConfidenceAssessment["baselineStatus"] = options.baseline
    ? options.baseline.status
    : "none";
  const confidence = computeConfidence({
    calibrationQuality,
    stepCount: steps.length,
    durationSeconds,
    measuredSampleRateHz,
    expectedSampleRateHz: 100,
    packetLossEstimate: options.packetLossEstimate ?? 0,
    badChannelCount: options.badChannelCount ?? 0,
    highLoadFlagFraction,
    leftFootUnverified,
    singleFoot,
    baselineStatus: baselineStatusForConfidence,
  });

  const commonLimitations = [
    "Relative load units are not validated Newtons or pressure values.",
    "Metrics are beta indicators and should be compared mainly to the user's own baseline."
  ];
  const loadLimitations = [...commonLimitations];
  if (!confidence.scoreShowable) {
    mechanicalReasonCodes.push("score_blocked_low_confidence");
    loadLimitations.push(`Training load is not reliable for this run: ${confidence.blocking.join(", ")}.`);
  }

  const mechanicalLoadValue: MechanicalLoadValue = {
    score0To100: mechanicalLoadScore,
    rawDose: cumulativeLoadValue,
    dosePerMinute: minutes > 0 ? cumulativeLoadValue / minutes : 0,
    dosePer1000Steps: steps.length > 0 ? (cumulativeLoadValue / steps.length) * 1000 : 0,
    intensity0To100: clampScore(baseIntensityScore),
    volumeFactor,
    components: {
      impact: clampScore(impactComponent * 100),
      loadRate: clampScore(loadRateComponent * 100),
      spikiness: clampScore(spikinessComponent * 100),
      fatigue: clampScore(fatigueComponent * 100),
    },
  };
  const perceivedLoadValue: PerceivedLoadValue = {
    score0To100: perceivedScoring.score,
    rawRpeMinutes,
    rpe0To10,
    durationMinutes: minutes,
  };
  const totalReasonCodes = totalTrainingLoadValue.missingStreams.includes("perceived")
    ? ["mechanical_only_no_perceived_load"]
    : ["mechanical_perceived_weighted"];
  if (!confidence.scoreShowable) totalReasonCodes.push("score_blocked_low_confidence");

  return {
    sessionId: frames[0].sessionId,
    foot: frames.every((frame) => frame.foot === frames[0].foot) ? frames[0].foot : "both",
    cadence: metric(cadenceValue, "steps/min (one foot)", ["detected foot-strike events", "session duration"], ["threshold_gait_detection"], commonLimitations, { confidence: confidence.level }),
    contactTime: metric(contactTimeValue, "ms", ["foot-strike and toe-off events"], ["load_threshold_contact_window"], commonLimitations, { confidence: confidence.level, experimental: true }),
    totalRelativeLoad: metric(totalRelativeLoadValue, "relative load sum", ["calibrated 16-zone pressure frames"], ["relative_pressure_sum"], commonLimitations, { confidence: confidence.level }),
    peakLoad: metric(peakLoadValue, "relative load", ["95th percentile stance peak"], ["peak_load_percentile"], commonLimitations, { confidence: confidence.level }),
    cumulativeLoad: metric(cumulativeLoadValue, "relative load seconds", ["per-step impulse proxy"], ["time_integrated_relative_load"], commonLimitations, { confidence: confidence.level }),
    loadRateProxy: metric(loadRateValue, "relative load/s", ["early stance load slope"], ["first_15_percent_contact_slope"], commonLimitations, { confidence: confidence.level, experimental: true }),
    medialLateralBalance: metric(medialLateralBalanceValue, "0-100 balance score", ["medial and lateral zone groups"], ["symmetry_relative_score"], commonLimitations, { confidence: confidence.level }),
    heelMidForeToeDistribution: {
      value: {
        heel: ratio(regionTotals.heel, allRegionLoad),
        midfoot: midfootRatio,
        forefoot: ratio(regionTotals.forefoot, allRegionLoad),
        toe: toeRatio
      },
      units: "fraction of total relative load",
      contributingData: ["editable zone map", "calibrated zone loads"],
      reasonCodes: ["region_load_fraction"],
      limitations: commonLimitations,
      confidence: confidence.level
    },
    impactLoad: metric(accelImpactG, "g over 1g", ["accel magnitude deviation (rotation invariant)"], ["imu_magnitude_impact_proxy"], [...commonLimitations, "IMU at ~104 Hz cannot capture true impact transients; this is an experimental proxy, not ground reaction force."], { confidence: confidence.level, experimental: true }),
    fatigueShift: metric(fatigueShiftValue, "percentage-point shift", ["first half forefoot/toe ratio", "second half forefoot/toe ratio"], ["first_half_second_half_shift", forefootShiftSigned >= 0 ? "forefoot_increasing" : "forefoot_decreasing"], commonLimitations, { confidence: confidence.level, experimental: true }),
    mechanicalLoad: structuredMetric(mechanicalLoadValue, "0-100 score + relative dose", ["pressure impulse", "IMU impact proxy", "load-rate ratio", "peak/median spikiness", "directional fatigue shift"], mechanicalReasonCodes, loadLimitations, { confidence: confidence.level }),
    perceivedLoad: structuredMetric(perceivedLoadValue, "RPE-minutes + 0-100 score", ["session perceived effort", "session duration"], perceivedScoring.reasonCodes, ["Perceived Load is subjective and depends on the user's entered effort."], { confidence: confidence.level }),
    totalTrainingLoad: structuredMetric(totalTrainingLoadValue, "0-100", ["Mechanical Load", "Perceived Load when supplied"], totalReasonCodes, loadLimitations, { confidence: confidence.level }),
    trainingStrain: metric(totalTrainingLoadValue.score0To100, "0-100", ["Mechanical Load", "Perceived Load when supplied"], [...totalReasonCodes, "training_strain_alias"], loadLimitations, { confidence: confidence.level }),
    categoryScores: {
      loadBalance: metric(medialLateralBalanceValue, "0-100", ["medial and lateral zone groups"], ["relative_balance"], commonLimitations, { confidence: confidence.level }),
      impactLoad: metric(clampScore(impactComponent * 100), "0-100", ["IMU magnitude impact proxy"], ["impact_proxy_score"], commonLimitations, { confidence: confidence.level, experimental: true }),
      forefootMetatarsalLoad: metric(clampScore(forefootRatio * 130), "0-100", ["forefoot and toe zones"], ["forefoot_fraction_score"], commonLimitations, { confidence: confidence.level }),
      heelLoad: metric(clampScore(heelRatio * 170), "0-100", ["heel zones"], ["heel_fraction_score"], commonLimitations, { confidence: confidence.level }),
      archMidfootLoad: metric(clampScore(midfootRatio * 200), "0-100", ["midfoot zones"], ["midfoot_fraction_score"], commonLimitations, { confidence: confidence.level }),
      toeOffContribution: metric(clampScore(toeRatio * 220), "0-100", ["toe zones during late stance"], ["toe_fraction_score"], commonLimitations, { confidence: confidence.level, experimental: true }),
      fatigueShift: metric(clampScore(Math.max(0, forefootShiftSigned) * 4), "0-100", ["first half", "second half"], ["fatigue_shift_proxy"], commonLimitations, { confidence: confidence.level, experimental: true }),
      shoeLoadScore: metric(clampScore(100 - Math.abs(50 - medialLateralBalanceValue) * 0.4 - fatigueShiftValue), "0-100", ["load balance", "fatigue shift", "shoe context when known"], ["shoe_context_proxy"], commonLimitations, { confidence: confidence.level, experimental: true })
    },
    confidence,
    steps
  };
}

export function combineFootMetrics(left?: RunMetrics, right?: RunMetrics): RunMetrics {
  if (!left && !right) {
    throw new Error("At least one foot metric set is required");
  }
  if (!left) return right!;
  if (!right) return left;

  const numeric = (a: MetricValue, b: MetricValue) =>
    typeof a.value === "number" && typeof b.value === "number" ? ([a.value, b.value] as const) : null;

  const combine = (a: MetricValue, b: MetricValue, op: (x: number, y: number) => number, code: string): MetricValue => {
    const pair = numeric(a, b);
    return {
      ...a,
      value: pair ? op(pair[0], pair[1]) : a.value,
      contributingData: [...new Set([...a.contributingData, ...b.contributingData])],
      reasonCodes: [...new Set([...a.reasonCodes, ...b.reasonCodes, code])],
      confidence: a.confidence && b.confidence ? worseConfidence(a.confidence, b.confidence) : a.confidence,
    };
  };
  const avg = (a: MetricValue, b: MetricValue) => combine(a, b, (x, y) => (x + y) / 2, "left_right_averaged");
  const sum = (a: MetricValue, b: MetricValue) => combine(a, b, (x, y) => x + y, "left_right_summed");

  const combineMechanicalLoad = (
    a: MetricValue<MechanicalLoadValue>,
    b: MetricValue<MechanicalLoadValue>
  ): MetricValue<MechanicalLoadValue> => {
    const totalSteps = Math.max(1, left.steps.length + right.steps.length);
    const rawDose = a.value.rawDose + b.value.rawDose;
    const minutesA = a.value.dosePerMinute > 0 ? a.value.rawDose / a.value.dosePerMinute : 0;
    const minutesB = b.value.dosePerMinute > 0 ? b.value.rawDose / b.value.dosePerMinute : 0;
    const minutes = Math.max(minutesA, minutesB, 0);
    const value: MechanicalLoadValue = {
      score0To100: clampScore((a.value.score0To100 + b.value.score0To100) / 2),
      rawDose,
      dosePerMinute: minutes > 0 ? rawDose / minutes : 0,
      dosePer1000Steps: (rawDose / totalSteps) * 1000,
      intensity0To100: clampScore((a.value.intensity0To100 + b.value.intensity0To100) / 2),
      volumeFactor: (a.value.volumeFactor + b.value.volumeFactor) / 2,
      components: {
        impact: clampScore((a.value.components.impact + b.value.components.impact) / 2),
        loadRate: clampScore((a.value.components.loadRate + b.value.components.loadRate) / 2),
        spikiness: clampScore((a.value.components.spikiness + b.value.components.spikiness) / 2),
        fatigue: clampScore((a.value.components.fatigue + b.value.components.fatigue) / 2),
      },
    };
    return {
      ...a,
      value,
      contributingData: [...new Set([...a.contributingData, ...b.contributingData])],
      reasonCodes: [...new Set([...a.reasonCodes, ...b.reasonCodes, "left_right_combined"])],
      confidence: a.confidence && b.confidence ? worseConfidence(a.confidence, b.confidence) : a.confidence,
    };
  };

  const combinePerceivedLoad = (
    a: MetricValue<PerceivedLoadValue>,
    b: MetricValue<PerceivedLoadValue>
  ): MetricValue<PerceivedLoadValue> => {
    // Perceived Load belongs to the whole run, not each foot; both sides should carry the same
    // RPE-minutes, so average to avoid double-counting if they differ from a bad caller.
    const rawValues = [a.value.rawRpeMinutes, b.value.rawRpeMinutes].filter((value): value is number => value != null);
    const scoreValues = [a.value.score0To100, b.value.score0To100].filter((value): value is number => value != null);
    const rpeValues = [a.value.rpe0To10, b.value.rpe0To10].filter((value): value is number => value != null);
    const value: PerceivedLoadValue = {
      score0To100: scoreValues.length ? clampScore(mean(scoreValues)) : null,
      rawRpeMinutes: rawValues.length ? mean(rawValues) : null,
      rpe0To10: rpeValues.length ? mean(rpeValues) : null,
      durationMinutes: Math.max(a.value.durationMinutes, b.value.durationMinutes),
    };
    return {
      ...a,
      value,
      contributingData: [...new Set([...a.contributingData, ...b.contributingData])],
      reasonCodes: [...new Set([...a.reasonCodes, ...b.reasonCodes, "left_right_run_level_averaged"])],
      confidence: a.confidence && b.confidence ? worseConfidence(a.confidence, b.confidence) : a.confidence,
    };
  };

  // Distributions are averaged element-wise (the old code dropped the right foot entirely).
  const avgDistribution = (
    a: MetricValue<Record<string, number>>,
    b: MetricValue<Record<string, number>>
  ): MetricValue<Record<string, number>> => {
    const keys = new Set([...Object.keys(a.value), ...Object.keys(b.value)]);
    const value: Record<string, number> = {};
    keys.forEach((key) => {
      value[key] = ((a.value[key] ?? 0) + (b.value[key] ?? 0)) / 2;
    });
    return {
      ...a,
      value,
      contributingData: [...new Set([...a.contributingData, ...b.contributingData])],
      reasonCodes: [...new Set([...a.reasonCodes, ...b.reasonCodes, "left_right_averaged"])],
      confidence: a.confidence && b.confidence ? worseConfidence(a.confidence, b.confidence) : a.confidence,
    };
  };

  // Left/right asymmetry from per-foot cumulative load (total impulse per side). Experimental and
  // only meaningful when the two pods are time-aligned (the caller must ensure overlap).
  const leftLoad = typeof left.cumulativeLoad.value === "number" ? left.cumulativeLoad.value : 0;
  const rightLoad = typeof right.cumulativeLoad.value === "number" ? right.cumulativeLoad.value : 0;
  const meanLoad = (leftLoad + rightLoad) / 2;
  const asymmetryPct = meanLoad > 0 ? (Math.abs(leftLoad - rightLoad) / meanLoad) * 100 : 0;
  const combinedConfidence = worseConfidence(left.confidence.level, right.confidence.level);
  const mechanicalLoad = combineMechanicalLoad(left.mechanicalLoad, right.mechanicalLoad);
  const perceivedLoad = combinePerceivedLoad(left.perceivedLoad, right.perceivedLoad);
  const totalTrainingLoadValue = fuseTrainingLoad({
    mechanicalScore: mechanicalLoad.value.score0To100,
    perceivedScore: perceivedLoad.value.score0To100,
  });
  const totalReasonCodes = totalTrainingLoadValue.missingStreams.includes("perceived")
    ? ["mechanical_only_no_perceived_load", "left_right_combined"]
    : ["mechanical_perceived_weighted", "left_right_combined"];
  if (combinedConfidence === "blocked") totalReasonCodes.push("score_blocked_low_confidence");

  return {
    ...left,
    foot: "both",
    // Cadence is per-foot step rate; total running cadence is the SUM of both feet (~160-180 spm),
    // not the average (which would report ~half and was a real bug).
    cadence: { ...sum(left.cadence, right.cadence), units: "steps/min (both feet)" },
    contactTime: avg(left.contactTime, right.contactTime),
    totalRelativeLoad: sum(left.totalRelativeLoad, right.totalRelativeLoad),
    peakLoad: avg(left.peakLoad, right.peakLoad),
    cumulativeLoad: sum(left.cumulativeLoad, right.cumulativeLoad),
    loadRateProxy: avg(left.loadRateProxy, right.loadRateProxy),
    medialLateralBalance: avg(left.medialLateralBalance, right.medialLateralBalance),
    heelMidForeToeDistribution: avgDistribution(left.heelMidForeToeDistribution, right.heelMidForeToeDistribution),
    impactLoad: avg(left.impactLoad, right.impactLoad),
    fatigueShift: avg(left.fatigueShift, right.fatigueShift),
    mechanicalLoad,
    perceivedLoad,
    totalTrainingLoad: structuredMetric(
      totalTrainingLoadValue,
      "0-100",
      ["Mechanical Load", "Perceived Load when supplied"],
      totalReasonCodes,
      left.totalTrainingLoad.limitations,
      { confidence: combinedConfidence }
    ),
    trainingStrain: metric(
      totalTrainingLoadValue.score0To100,
      "0-100",
      ["Mechanical Load", "Perceived Load when supplied"],
      [...totalReasonCodes, "training_strain_alias"],
      left.trainingStrain.limitations,
      { confidence: combinedConfidence }
    ),
    asymmetry: metric(
      asymmetryPct,
      "% load difference (L vs R)",
      ["per-foot cumulative load"],
      ["left_right_cumulative_asymmetry"],
      [
        "Experimental. Requires two time-aligned pods.",
        "Left-foot medial/lateral interpretation depends on an unverified hardware wiring assumption.",
      ],
      { confidence: combinedConfidence, experimental: true }
    ),
    steps: [...left.steps, ...right.steps].sort((a, b) => a.startMs - b.startMs),
    categoryScores: {
      loadBalance: avg(left.categoryScores.loadBalance, right.categoryScores.loadBalance),
      impactLoad: avg(left.categoryScores.impactLoad, right.categoryScores.impactLoad),
      forefootMetatarsalLoad: avg(left.categoryScores.forefootMetatarsalLoad, right.categoryScores.forefootMetatarsalLoad),
      heelLoad: avg(left.categoryScores.heelLoad, right.categoryScores.heelLoad),
      archMidfootLoad: avg(left.categoryScores.archMidfootLoad, right.categoryScores.archMidfootLoad),
      toeOffContribution: avg(left.categoryScores.toeOffContribution, right.categoryScores.toeOffContribution),
      fatigueShift: avg(left.categoryScores.fatigueShift, right.categoryScores.fatigueShift),
      shoeLoadScore: avg(left.categoryScores.shoeLoadScore, right.categoryScores.shoeLoadScore)
    },
    confidence: {
      ...left.confidence,
      level: combinedConfidence,
      score: Math.min(left.confidence.score, right.confidence.score),
      reasonCodes: [...new Set([...left.confidence.reasonCodes, ...right.confidence.reasonCodes, "two_foot_combined"])],
      blocking: [...new Set([...left.confidence.blocking, ...right.confidence.blocking])],
      scoreShowable: combinedConfidence !== "blocked",
    },
  };
}

export function scoreCategory(score: number): "low" | "moderate" | "high" | "very_high" {
  if (score < 35) return "low";
  if (score < 65) return "moderate";
  if (score < 85) return "high";
  return "very_high";
}
