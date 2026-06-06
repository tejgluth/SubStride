import type { ShoeProfile } from '@substride/analytics';
import type { BetaSessionRecord } from './betaAppModel';
import { labelForSurface } from './betaAppModel';

export interface ShoeScoreSummary {
  shoeId: string;
  shoeName: string;
  score: number;
  runCount: number;
  adjustedLoad: number;
  perceivedEffort: number;
  pain: number;
  impact: number;
  balance: number;
  surfaces: string;
  confidence: 'early' | 'moderate' | 'strong';
}

interface ShoeScoreRun {
  record: BetaSessionRecord;
  shoeId: string;
  mechanicalLoad: number;
}

const CONDITION_MATCH_MINIMUM = 2;

export function buildShoeScores(history: BetaSessionRecord[], shoes: ShoeProfile[]): ShoeScoreSummary[] {
  const validRuns = history
    .filter((record) => record.metrics.confidence.scoreShowable)
    .map((record) => ({
      record,
      shoeId: record.context.shoeId ?? 'unknown-shoe',
      mechanicalLoad: safeScore(record.metrics.mechanicalLoad.value.score0To100),
    }));
  if (validRuns.length === 0) return [];

  const overallMechanicalMean = robustMean(validRuns.map((run) => run.mechanicalLoad));
  const byShoe = new Map<string, ShoeScoreRun[]>();
  validRuns.forEach((run) => {
    const runs = byShoe.get(run.shoeId) ?? [];
    runs.push(run);
    byShoe.set(run.shoeId, runs);
  });

  return [...byShoe.entries()].map(([shoeId, runs]) => {
    const records = runs.map((run) => run.record);
    const shoe = shoes.find((candidate) => candidate.id === shoeId);
    const adjustedLoads = runs.map((run) => {
      const conditionMean = conditionMeanFor(run.record, validRuns) ?? overallMechanicalMean;
      return clampScore(run.mechanicalLoad - conditionMean + overallMechanicalMean);
    });

    const adjustedLoad = robustMean(adjustedLoads);
    const perceivedEffort = robustMean(records.map((record) => perceivedEffortScore(record)));
    const pain = robustMean(records.map((record) => safeScore(record.context.painScore0To10, 0, 10)));
    const impact = robustMean(records.map((record) => safeScore(record.metrics.categoryScores.impactLoad.value)));
    const fatiguePenalty = robustMean(records.map((record) => Math.min(100, Math.abs(safeScore(record.metrics.fatigueShift.value, -100, 100)) * 4)));
    const balance = robustMean(records.map((record) => safeScore(record.metrics.categoryScores.loadBalance.value)));
    const balancePenalty = robustMean(records.map((record) => 100 - safeScore(record.metrics.categoryScores.loadBalance.value)));
    const confidencePenalty = robustMean(records.map((record) => 100 - safeScore(record.metrics.confidence.score)));
    const lowSamplePenalty = samplePenalty(records.length);
    const penalty = 0.30 * adjustedLoad
      + 0.15 * perceivedEffort
      + 0.17 * (pain * 10)
      + 0.18 * impact
      + 0.10 * fatiguePenalty
      + 0.06 * balancePenalty
      + 0.02 * confidencePenalty
      + lowSamplePenalty;
    const surfaces = [...new Set(records.map((record) => labelForSurface(record.context.surface)))].slice(0, 3).join(', ');

    return {
      shoeId,
      shoeName: shoe?.name ?? 'Unknown shoe',
      score: clampScore(100 - penalty),
      runCount: records.length,
      adjustedLoad,
      perceivedEffort,
      pain,
      impact,
      balance,
      surfaces: surfaces || 'Mixed',
      confidence: scoreConfidence(records.length),
    };
  }).sort((a, b) => b.score - a.score);
}

function conditionMeanFor(record: BetaSessionRecord, runs: ShoeScoreRun[]): number | null {
  const conditionTiers: Array<(candidate: BetaSessionRecord) => boolean> = [
    (candidate) => (
      candidate.context.surface === record.context.surface
      && candidate.context.workoutType === record.context.workoutType
      && effortBucket(candidate) === effortBucket(record)
    ),
    (candidate) => (
      candidate.context.surface === record.context.surface
      && candidate.context.workoutType === record.context.workoutType
    ),
    (candidate) => (
      candidate.context.workoutType === record.context.workoutType
      && effortBucket(candidate) === effortBucket(record)
    ),
    (candidate) => candidate.context.workoutType === record.context.workoutType,
  ];

  for (const matches of conditionTiers) {
    const matched = runs.filter((run) => matches(run.record));
    if (matched.length >= CONDITION_MATCH_MINIMUM) {
      return robustMean(matched.map((run) => run.mechanicalLoad));
    }
  }
  return null;
}

function effortBucket(record: BetaSessionRecord): string {
  const effort = record.context.perceivedEffort0To10;
  if (effort <= 3) return 'easy';
  if (effort <= 6) return 'moderate';
  return 'hard';
}

function perceivedEffortScore(record: BetaSessionRecord): number {
  return safeScore(record.metrics.perceivedLoad.value.score0To100 ?? record.context.perceivedEffort0To10 * 10);
}

function robustMean(values: number[]): number {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return 0;
  if (finite.length < 3) return mean(finite);
  if (finite.length < 5) return median(finite);

  const trim = Math.max(1, Math.floor(finite.length * 0.2));
  const trimmed = finite.slice(trim, finite.length - trim);
  return mean(trimmed.length > 0 ? trimmed : finite);
}

function median(values: number[]): number {
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function samplePenalty(runCount: number): number {
  if (runCount <= 1) return 6;
  if (runCount === 2) return 3;
  return 0;
}

function scoreConfidence(runCount: number): ShoeScoreSummary['confidence'] {
  if (runCount >= 5) return 'strong';
  if (runCount >= 3) return 'moderate';
  return 'early';
}

function safeScore(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
