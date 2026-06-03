import type { ConfidenceLevel, RunMetrics, Session } from "./types";

export type LongitudinalLoadStatus =
  | "no_data"
  | "session_only"
  | "acute_provisional"
  | "chronic_provisional"
  | "full";

export interface TimestampedRunLoad {
  session: Session;
  metrics: RunMetrics;
  /** Optional post-run context, used only as a conservative recovery-context signal. */
  painScore0To10?: number;
}

export interface DailyLoadPoint {
  day: string;
  mechanical: number;
  perceived: number;
  total: number;
}

export interface LoadStreamState {
  acute: number;
  chronic: number;
  balance: number;
  acuteChronicRatio: number | null;
  tolerance28d: number;
}

export interface RiskSignal {
  value0To100: number | null;
  level: "blocked" | "low" | "moderate" | "high";
  confidence: ConfidenceLevel;
  reasonCodes: string[];
  subscores: {
    spike: number;
    monotony: number;
    mechanical: number;
    asymmetry: number;
    fatigueDrift: number;
    recoveryContext: number;
  };
}

export interface LongitudinalTimelinePoint {
  at: string;
  sessionId?: string;
  currentLoadScore0To100: number;
  acuteTotal: number;
  chronicTotal: number;
  acuteChronicRatio: number | null;
}

export interface LongitudinalTrainingLoad {
  asOf: string;
  status: LongitudinalLoadStatus;
  confidence: ConfidenceLevel;
  sessionCount: number;
  validSessionCount: number;
  firstSessionAt?: string;
  observedSpanDays: number;
  currentLoadScore0To100: number;
  mechanical: LoadStreamState;
  perceived: LoadStreamState;
  total: LoadStreamState;
  monotony7d: number;
  trainingStrain7d: number;
  dailyLoads: DailyLoadPoint[];
  timeline: LongitudinalTimelinePoint[];
  riskSignal: RiskSignal;
  reasonCodes: string[];
}

interface NormalizedRunLoad {
  sessionId: string;
  atMs: number;
  mechanical: number;
  perceived: number;
  total: number;
  impact: number;
  forefoot: number;
  heel: number;
  fatigue: number;
  asymmetry: number;
  pain: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ACUTE_TAU_DAYS = 7;
const CHRONIC_TAU_DAYS = 42;
const MONOTONY_DAYS = 7;
const TOLERANCE_DAYS = 28;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function asTime(value: Date | string | number | undefined): number | null {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function sessionTimeMs(session: Session): number | null {
  return asTime(session.endedAt) ?? asTime(session.startedAt) ?? asTime(session.createdAt);
}

function dayKey(timeMs: number): string {
  return new Date(timeMs).toISOString().slice(0, 10);
}

function startOfUtcDay(timeMs: number): number {
  const d = new Date(timeMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length);
}

function streamLoadState(runs: NormalizedRunLoad[], asOfMs: number, stream: "mechanical" | "perceived" | "total"): LoadStreamState {
  const acute = runs.reduce((sum, run) => {
    const ageDays = Math.max(0, (asOfMs - run.atMs) / MS_PER_DAY);
    return sum + run[stream] * Math.exp(-ageDays / ACUTE_TAU_DAYS);
  }, 0);
  const chronic = runs.reduce((sum, run) => {
    const ageDays = Math.max(0, (asOfMs - run.atMs) / MS_PER_DAY);
    return sum + run[stream] * Math.exp(-ageDays / CHRONIC_TAU_DAYS);
  }, 0);
  const tolerance28d = dailyLoadsForWindow(runs, asOfMs, TOLERANCE_DAYS)
    .reduce((sum, day) => sum + day[stream], 0) / TOLERANCE_DAYS;

  return {
    acute,
    chronic,
    balance: chronic - acute,
    acuteChronicRatio: chronic > 1e-6 ? acute / chronic : null,
    tolerance28d,
  };
}

function normalizeRunLoad(input: TimestampedRunLoad, asOfMs: number): NormalizedRunLoad | null {
  const atMs = sessionTimeMs(input.session);
  if (atMs == null || atMs > asOfMs) return null;
  if (!input.metrics.confidence.scoreShowable) return null;

  const perceivedScore = input.metrics.perceivedLoad.value.score0To100 ?? 0;
  const asymmetryValue = typeof input.metrics.asymmetry?.value === "number" ? input.metrics.asymmetry.value : 0;

  return {
    sessionId: input.session.id,
    atMs,
    mechanical: Math.max(0, input.metrics.mechanicalLoad.value.score0To100),
    perceived: Math.max(0, perceivedScore),
    total: Math.max(0, input.metrics.totalTrainingLoad.value.score0To100),
    impact: clamp01(input.metrics.categoryScores.impactLoad.value / 100),
    forefoot: clamp01(input.metrics.categoryScores.forefootMetatarsalLoad.value / 100),
    heel: clamp01(input.metrics.categoryScores.heelLoad.value / 100),
    fatigue: clamp01(input.metrics.categoryScores.fatigueShift.value / 100),
    asymmetry: clamp01(asymmetryValue / 30),
    pain: clamp01((input.painScore0To10 ?? input.session.painScore0To10 ?? 0) / 10),
  };
}

function dailyLoadsForWindow(runs: NormalizedRunLoad[], asOfMs: number, days: number): DailyLoadPoint[] {
  const endDay = startOfUtcDay(asOfMs);
  const byDay = new Map<string, DailyLoadPoint>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dayMs = endDay - offset * MS_PER_DAY;
    const key = dayKey(dayMs);
    byDay.set(key, { day: key, mechanical: 0, perceived: 0, total: 0 });
  }

  runs.forEach((run) => {
    const key = dayKey(run.atMs);
    const point = byDay.get(key);
    if (!point) return;
    point.mechanical += run.mechanical;
    point.perceived += run.perceived;
    point.total += run.total;
  });

  return [...byDay.values()];
}

function weightedRecentMean(runs: NormalizedRunLoad[], asOfMs: number, pick: (run: NormalizedRunLoad) => number): number {
  let weightTotal = 0;
  let valueTotal = 0;
  runs.forEach((run) => {
    const ageDays = Math.max(0, (asOfMs - run.atMs) / MS_PER_DAY);
    const weight = Math.exp(-ageDays / ACUTE_TAU_DAYS);
    weightTotal += weight;
    valueTotal += pick(run) * weight;
  });
  return weightTotal > 0 ? valueTotal / weightTotal : 0;
}

function confidenceFor(status: LongitudinalLoadStatus): ConfidenceLevel {
  if (status === "no_data" || status === "session_only") return "low";
  if (status === "acute_provisional" || status === "chronic_provisional") return "moderate";
  return "high";
}

function statusFor(validSessionCount: number, observedSpanDays: number): LongitudinalLoadStatus {
  if (validSessionCount === 0) return "no_data";
  if (observedSpanDays < 7 || validSessionCount < 3) return "session_only";
  if (observedSpanDays < 28) return "acute_provisional";
  if (observedSpanDays < 42) return "chronic_provisional";
  return "full";
}

function riskSignalFor(input: {
  runs: NormalizedRunLoad[];
  asOfMs: number;
  status: LongitudinalLoadStatus;
  mechanical: LoadStreamState;
  monotony7d: number;
  confidence: ConfidenceLevel;
}): RiskSignal {
  const reasonCodes: string[] = ["report3_transparent_risk_signal_not_probability"];
  const ratio = input.mechanical.acuteChronicRatio;
  const spike = ratio == null ? 0 : clamp01(logistic((ratio - 1.15) / 0.15));
  const monotony = clamp01((input.monotony7d - 0.55) / 0.12);
  const mechanical = clamp01(
    0.35 * weightedRecentMean(input.runs, input.asOfMs, (run) => run.impact)
    + 0.25 * weightedRecentMean(input.runs, input.asOfMs, (run) => run.fatigue)
    + 0.2 * weightedRecentMean(input.runs, input.asOfMs, (run) => run.forefoot)
    + 0.2 * weightedRecentMean(input.runs, input.asOfMs, (run) => run.heel)
  );
  const asymmetry = clamp01(weightedRecentMean(input.runs, input.asOfMs, (run) => run.asymmetry));
  const fatigueDrift = clamp01(weightedRecentMean(input.runs, input.asOfMs, (run) => run.fatigue));
  const recoveryContext = clamp01(weightedRecentMean(input.runs, input.asOfMs, (run) => run.pain));

  if (input.status === "no_data" || input.status === "session_only") {
    reasonCodes.push("insufficient_history_no_risk_signal");
    return {
      value0To100: null,
      level: "blocked",
      confidence: input.confidence,
      reasonCodes,
      subscores: { spike, monotony, mechanical, asymmetry, fatigueDrift, recoveryContext },
    };
  }

  if (ratio == null || input.mechanical.chronic < 5) {
    reasonCodes.push("chronic_load_cold_start");
  }

  const raw =
    0.3 * spike
    + 0.15 * monotony
    + 0.25 * mechanical
    + 0.1 * asymmetry
    + 0.1 * fatigueDrift
    + 0.1 * recoveryContext;
  const value0To100 = clampScore(raw * 100);
  const level = value0To100 >= 65 ? "high" : value0To100 >= 35 ? "moderate" : "low";

  return {
    value0To100,
    level,
    confidence: input.confidence,
    reasonCodes,
    subscores: { spike, monotony, mechanical, asymmetry, fatigueDrift, recoveryContext },
  };
}

function timelineFor(runs: NormalizedRunLoad[], asOfMs: number): LongitudinalTimelinePoint[] {
  const points: LongitudinalTimelinePoint[] = runs.map((run) => {
    const total = streamLoadState(runs.filter((item) => item.atMs <= run.atMs), run.atMs, "total");
    return {
      at: new Date(run.atMs).toISOString(),
      sessionId: run.sessionId,
      currentLoadScore0To100: clampScore(total.acute),
      acuteTotal: total.acute,
      chronicTotal: total.chronic,
      acuteChronicRatio: total.acuteChronicRatio,
    };
  });
  const total = streamLoadState(runs, asOfMs, "total");
  points.push({
    at: new Date(asOfMs).toISOString(),
    currentLoadScore0To100: clampScore(total.acute),
    acuteTotal: total.acute,
    chronicTotal: total.chronic,
    acuteChronicRatio: total.acuteChronicRatio,
  });
  return points;
}

export function computeLongitudinalTrainingLoad(
  sessions: TimestampedRunLoad[],
  options: { asOf?: Date | string | number } = {}
): LongitudinalTrainingLoad {
  const asOfMs = asTime(options.asOf) ?? Date.now();
  const asOf = new Date(asOfMs).toISOString();
  const runs = sessions
    .map((session) => normalizeRunLoad(session, asOfMs))
    .filter((run): run is NormalizedRunLoad => run != null)
    .sort((a, b) => a.atMs - b.atMs);
  const firstSessionAt = runs[0] ? new Date(runs[0].atMs).toISOString() : undefined;
  const observedSpanDays = runs[0] ? Math.max(0, (asOfMs - runs[0].atMs) / MS_PER_DAY) : 0;
  const status = statusFor(runs.length, observedSpanDays);
  const confidence = confidenceFor(status);
  const reasonCodes = [`status_${status}`, "continuous_exponential_7_42_day_decay"];

  const mechanical = streamLoadState(runs, asOfMs, "mechanical");
  const perceived = streamLoadState(runs, asOfMs, "perceived");
  const total = streamLoadState(runs, asOfMs, "total");
  const dailyLoads = dailyLoadsForWindow(runs, asOfMs, TOLERANCE_DAYS);
  const last7 = dailyLoads.slice(-MONOTONY_DAYS);
  const last7Totals = last7.map((day) => day.total);
  const mean7 = mean(last7Totals);
  const monotony7d = mean7 > 0 ? mean7 / (mean7 + stdDev(last7Totals)) : 0;
  const trainingStrain7d = last7Totals.reduce((sum, value) => sum + value, 0) * monotony7d;
  const riskSignal = riskSignalFor({ runs, asOfMs, status, mechanical, monotony7d, confidence });

  return {
    asOf,
    status,
    confidence,
    sessionCount: sessions.length,
    validSessionCount: runs.length,
    firstSessionAt,
    observedSpanDays,
    currentLoadScore0To100: clampScore(total.acute),
    mechanical,
    perceived,
    total,
    monotony7d,
    trainingStrain7d,
    dailyLoads,
    timeline: timelineFor(runs, asOfMs),
    riskSignal,
    reasonCodes,
  };
}
