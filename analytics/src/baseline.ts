import type { BaselineSummary, RunMetrics } from "./types";

export interface BaselineInputRun {
  sessionId: string;
  userId: string;
  metrics: RunMetrics;
  calibrationQuality: "pass" | "warn" | "fail";
  painScore0To10?: number;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1));
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function buildBaseline(userId: string, runs: BaselineInputRun[]): BaselineSummary {
  const included = runs.filter((run) => run.calibrationQuality !== "fail" && (run.painScore0To10 ?? 0) <= 3);
  const excludedSessionIds = runs.filter((run) => !included.includes(run)).map((run) => run.sessionId);
  const reasonCodes: string[] = [];
  if (excludedSessionIds.length > 0) reasonCodes.push("excluded_failed_calibration_or_pain_marked_sessions");
  if (included.length < 3) reasonCodes.push("preliminary_until_three_included_runs");
  if (included.length >= 5 && included.length < 7) reasonCodes.push("baseline_strengthening_between_five_and_seven_runs");

  const metricsToCollect = {
    trainingStrain: (run: BaselineInputRun) => run.metrics.trainingStrain.value,
    mechanicalLoadScore: (run: BaselineInputRun) => run.metrics.mechanicalLoad?.value.score0To100,
    perceivedLoadRaw: (run: BaselineInputRun) => run.metrics.perceivedLoad?.value.rawRpeMinutes,
    perceivedLoadScore: (run: BaselineInputRun) => run.metrics.perceivedLoad?.value.score0To100,
    totalTrainingLoadScore: (run: BaselineInputRun) => run.metrics.totalTrainingLoad?.value.score0To100,
    cadence: (run: BaselineInputRun) => run.metrics.cadence.value,
    contactTime: (run: BaselineInputRun) => run.metrics.contactTime.value,
    impactLoad: (run: BaselineInputRun) => run.metrics.impactLoad.value,
    fatigueShift: (run: BaselineInputRun) => run.metrics.fatigueShift.value,
    medialLateralBalance: (run: BaselineInputRun) => run.metrics.medialLateralBalance.value,
    cumulativeLoad: (run: BaselineInputRun) => run.metrics.cumulativeLoad.value,
    // Load per step (foot-count invariant). Mechanical Load's baseline volume factor compares the
    // current run's per-step load to this mean (like-to-like, replacing the old unit-mismatched factor).
    cumulativeLoadPerStep: (run: BaselineInputRun) =>
      run.metrics.cumulativeLoad.value / Math.max(1, run.metrics.steps.length)
  };

  const metrics: BaselineSummary["metrics"] = {};
  for (const [key, selector] of Object.entries(metricsToCollect)) {
    const values = included.map(selector).map(numeric).filter((value): value is number => value !== undefined);
    metrics[key] = { mean: mean(values), stdDev: stdDev(values), sampleCount: values.length };
  }

  const status: BaselineSummary["status"] = included.length >= 7 ? "mature" : included.length >= 3 ? "baseline_enabled" : "preliminary";
  return {
    userId,
    runCount: runs.length,
    includedRunCount: included.length,
    status,
    metrics,
    excludedSessionIds,
    reasonCodes
  };
}

export function compareToBaseline(metricValue: number, metricName: string, baseline?: BaselineSummary): { delta: number; zScore?: number; reasonCodes: string[] } {
  const entry = baseline?.metrics[metricName];
  if (!baseline || !entry || entry.sampleCount < 3) {
    return { delta: 0, reasonCodes: ["baseline_not_ready"] };
  }
  const delta = metricValue - entry.mean;
  const zScore = entry.stdDev > 0 ? delta / entry.stdDev : undefined;
  return { delta, zScore, reasonCodes: [baseline.status] };
}
