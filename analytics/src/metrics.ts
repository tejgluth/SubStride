import type { BaselineSummary, CalibratedFrame, FootSide, MetricValue, RunMetrics, StepSegment } from "./types";
import { segmentSteps } from "./gait";

export interface ComputeMetricsOptions {
  baseline?: BaselineSummary;
  calibrationQuality?: "pass" | "warn" | "fail";
  expectedMode?: "run" | "walk" | "treadmill" | "test" | "unknown";
  shoeKnown?: boolean;
  packetLossEstimate?: number;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
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

function metric(value: number, units: string, contributingData: string[], reasonCodes: string[], limitations: string[] = []): MetricValue {
  return { value, units, contributingData, reasonCodes, limitations };
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

export function computeRunMetrics(frames: CalibratedFrame[], options: ComputeMetricsOptions = {}): RunMetrics {
  if (frames.length === 0) {
    throw new Error("Cannot compute metrics from an empty frame set");
  }

  const steps = segmentSteps(frames);
  const minutes = durationMinutes(frames);
  const totalLoads = frames.map((frame) => frame.totalLoad);
  const peakLoads = steps.length ? steps.map((step) => step.peakLoad) : totalLoads;
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
  const fatigueShiftValue = Math.abs(secondForefootRatio - firstForefootRatio) * 100;

  const cadenceValue = minutes > 0 ? steps.length / minutes : 0;
  const contactTimeValue = mean(steps.map((step) => step.contactTimeMs));
  const totalRelativeLoadValue = totalLoads.reduce((sum, value) => sum + value, 0);
  const peakLoadValue = percentile(peakLoads, 0.95);
  const cumulativeLoadValue = impulses.reduce((sum, value) => sum + value, 0);
  const loadRateValue = percentile(loadRates, 0.9);
  const medialLateralBalanceValue = balanceScore(regionTotals.medial, regionTotals.lateral);
  const verticalAccelImpact = percentile(frames.map((frame) => Math.abs(frame.accel[2] - 1)), 0.99);
  const impactLoadValue = verticalAccelImpact * 45 + loadRateValue / 1000;
  const forefootRatio = ratio(regionTotals.forefoot + regionTotals.toe, allRegionLoad);
  const heelRatio = ratio(regionTotals.heel, allRegionLoad);
  const midfootRatio = ratio(regionTotals.midfoot, allRegionLoad);
  const toeRatio = ratio(regionTotals.toe, allRegionLoad);

  const baselineLoadMean = options.baseline?.metrics.trainingStrain?.mean;
  const baselineFactor = baselineLoadMean && baselineLoadMean > 0 ? 0.8 + Math.min(1.4, totalRelativeLoadValue / baselineLoadMean) * 0.2 : 1;
  const rawStrain = (cumulativeLoadValue / Math.max(1, steps.length) / 25 + peakLoadValue / 80 + loadRateValue / 800 + impactLoadValue / 3 + fatigueShiftValue * 0.35) * baselineFactor;
  const trainingStrainValue = clampScore(rawStrain);

  const commonLimitations = [
    "Relative load units are not validated Newtons or pressure values.",
    "Metrics are beta indicators and should be compared mainly to the user's own baseline."
  ];

  return {
    sessionId: frames[0].sessionId,
    foot: frames.every((frame) => frame.foot === frames[0].foot) ? frames[0].foot : "both",
    cadence: metric(cadenceValue, "steps/min", ["detected foot-strike events", "session duration"], ["threshold_gait_detection"], commonLimitations),
    contactTime: metric(contactTimeValue, "ms", ["foot-strike and toe-off events"], ["load_threshold_contact_window"], commonLimitations),
    totalRelativeLoad: metric(totalRelativeLoadValue, "relative load sum", ["calibrated 16-zone pressure frames"], ["relative_pressure_sum"], commonLimitations),
    peakLoad: metric(peakLoadValue, "relative load", ["95th percentile stance peak"], ["peak_load_percentile"], commonLimitations),
    cumulativeLoad: metric(cumulativeLoadValue, "relative load seconds", ["per-step impulse proxy"], ["time_integrated_relative_load"], commonLimitations),
    loadRateProxy: metric(loadRateValue, "relative load/s", ["early stance load slope"], ["first_15_percent_contact_slope"], commonLimitations),
    medialLateralBalance: metric(medialLateralBalanceValue, "0-100 balance score", ["medial and lateral zone groups"], ["symmetry_relative_score"], commonLimitations),
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
      limitations: commonLimitations
    },
    impactLoad: metric(impactLoadValue, "relative impact proxy", ["vertical acceleration proxy", "pressure peak proxy"], ["pressure_plus_imu_proxy"], commonLimitations),
    fatigueShift: metric(fatigueShiftValue, "percentage-point shift", ["first half forefoot/toe ratio", "second half forefoot/toe ratio"], ["first_half_second_half_shift"], commonLimitations),
    trainingStrain: metric(trainingStrainValue, "0-100", ["cumulative load", "peak load", "load rate", "impact proxy", "fatigue shift", "personal baseline when available"], ["deterministic_weighted_score"], commonLimitations),
    categoryScores: {
      loadBalance: metric(medialLateralBalanceValue, "0-100", ["medial and lateral zone groups"], ["relative_balance"], commonLimitations),
      impactLoad: metric(clampScore(impactLoadValue * 2.2), "0-100", ["pressure and IMU impact proxy"], ["impact_proxy_score"], commonLimitations),
      forefootMetatarsalLoad: metric(clampScore(forefootRatio * 130), "0-100", ["forefoot and toe zones"], ["forefoot_fraction_score"], commonLimitations),
      heelLoad: metric(clampScore(heelRatio * 170), "0-100", ["heel zones"], ["heel_fraction_score"], commonLimitations),
      archMidfootLoad: metric(clampScore(midfootRatio * 200), "0-100", ["midfoot zones"], ["midfoot_fraction_score"], commonLimitations),
      toeOffContribution: metric(clampScore(toeRatio * 220), "0-100", ["toe zones during late stance"], ["toe_fraction_score"], commonLimitations),
      fatigueShift: metric(clampScore(fatigueShiftValue * 4), "0-100", ["first half", "second half"], ["fatigue_shift_proxy"], commonLimitations),
      shoeLoadScore: metric(clampScore(100 - Math.abs(50 - medialLateralBalanceValue) * 0.4 - fatigueShiftValue), "0-100", ["load balance", "fatigue shift", "shoe context when known"], ["shoe_context_proxy"], commonLimitations)
    },
    steps
  };
}

export function combineFootMetrics(left?: RunMetrics, right?: RunMetrics): RunMetrics {
  if (!left && !right) {
    throw new Error("At least one foot metric set is required");
  }
  if (!left) return right!;
  if (!right) return left;
  const averageMetric = (a: MetricValue, b: MetricValue): MetricValue => ({
    ...a,
    value: typeof a.value === "number" && typeof b.value === "number" ? (a.value + b.value) / 2 : a.value,
    contributingData: [...new Set([...a.contributingData, ...b.contributingData])],
    reasonCodes: [...new Set([...a.reasonCodes, ...b.reasonCodes, "left_right_combined"])]
  });
  return {
    ...left,
    foot: "both",
    cadence: averageMetric(left.cadence, right.cadence),
    contactTime: averageMetric(left.contactTime, right.contactTime),
    totalRelativeLoad: averageMetric(left.totalRelativeLoad, right.totalRelativeLoad),
    peakLoad: averageMetric(left.peakLoad, right.peakLoad),
    cumulativeLoad: averageMetric(left.cumulativeLoad, right.cumulativeLoad),
    loadRateProxy: averageMetric(left.loadRateProxy, right.loadRateProxy),
    medialLateralBalance: averageMetric(left.medialLateralBalance, right.medialLateralBalance),
    heelMidForeToeDistribution: left.heelMidForeToeDistribution,
    impactLoad: averageMetric(left.impactLoad, right.impactLoad),
    fatigueShift: averageMetric(left.fatigueShift, right.fatigueShift),
    trainingStrain: averageMetric(left.trainingStrain, right.trainingStrain),
    steps: [...left.steps, ...right.steps].sort((a, b) => a.startMs - b.startMs),
    categoryScores: {
      loadBalance: averageMetric(left.categoryScores.loadBalance, right.categoryScores.loadBalance),
      impactLoad: averageMetric(left.categoryScores.impactLoad, right.categoryScores.impactLoad),
      forefootMetatarsalLoad: averageMetric(left.categoryScores.forefootMetatarsalLoad, right.categoryScores.forefootMetatarsalLoad),
      heelLoad: averageMetric(left.categoryScores.heelLoad, right.categoryScores.heelLoad),
      archMidfootLoad: averageMetric(left.categoryScores.archMidfootLoad, right.categoryScores.archMidfootLoad),
      toeOffContribution: averageMetric(left.categoryScores.toeOffContribution, right.categoryScores.toeOffContribution),
      fatigueShift: averageMetric(left.categoryScores.fatigueShift, right.categoryScores.fatigueShift),
      shoeLoadScore: averageMetric(left.categoryScores.shoeLoadScore, right.categoryScores.shoeLoadScore)
    }
  };
}

export function scoreCategory(score: number): "low" | "moderate" | "high" | "very_high" {
  if (score < 35) return "low";
  if (score < 65) return "moderate";
  if (score < 85) return "high";
  return "very_high";
}
