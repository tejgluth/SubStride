import { describe, expect, it } from 'vitest';
import type { ShoeProfile } from '@substride/analytics';
import {
  addShoeProfile,
  buildRunComputation,
  createDefaultBetaAppState,
  type BetaSessionRecord,
  type SurfaceTag,
  type WorkoutTag,
} from '../mobile-app/src/domain/betaAppModel';
import { buildShoeScores } from '../mobile-app/src/domain/shoeComparison';

interface RecordOptions {
  id: string;
  shoeId: string;
  surface?: SurfaceTag;
  workoutType?: WorkoutTag;
  effort?: number;
  pain?: number;
  mechanical?: number;
  perceived?: number;
  total?: number;
  impact?: number;
  balance?: number;
  fatigue?: number;
  confidenceScore?: number;
  scoreShowable?: boolean;
  endedAt?: string;
}

const defaultEndedAt = '2026-06-01T12:00:00.000Z';

function shoesForTest(): ShoeProfile[] {
  const defaultShoe = createDefaultBetaAppState().shoes[0];
  const shoeA = { ...defaultShoe, id: 'shoe-a', name: 'Daily trainer' };
  const shoeB = addShoeProfile([shoeA], { id: 'shoe-b', name: 'Stable trainer' });
  return [shoeA, shoeB];
}

function makeRecord(options: RecordOptions): BetaSessionRecord {
  const state = createDefaultBetaAppState();
  state.shoes = shoesForTest();
  state.sessionContext = {
    ...state.sessionContext,
    shoeId: options.shoeId,
    surface: options.surface ?? 'treadmill',
    workoutType: options.workoutType ?? 'easy_run',
    perceivedEffort0To10: options.effort ?? 4,
    painScore0To10: options.pain ?? 0,
  };

  const computed = buildRunComputation(state, 'normal_easy_run', {
    durationSeconds: 60,
    asOf: options.endedAt ?? defaultEndedAt,
  });
  const record = computed.sessionRecord;
  const mechanical = options.mechanical ?? record.metrics.mechanicalLoad.value.score0To100;
  const perceived = options.perceived ?? record.metrics.perceivedLoad.value.score0To100 ?? (options.effort ?? 4) * 10;
  const total = options.total ?? Math.round(mechanical * 0.75 + perceived * 0.25);
  const impact = options.impact ?? record.metrics.categoryScores.impactLoad.value;
  const balance = options.balance ?? record.metrics.categoryScores.loadBalance.value;
  const fatigue = options.fatigue ?? record.metrics.fatigueShift.value;
  const scoreShowable = options.scoreShowable ?? true;
  const confidenceScore = options.confidenceScore ?? 95;

  return {
    ...record,
    label: `${options.workoutType ?? 'easy_run'} ${options.id}`,
    session: {
      ...record.session,
      id: options.id,
      createdAt: options.endedAt ?? defaultEndedAt,
      startedAt: new Date(new Date(options.endedAt ?? defaultEndedAt).getTime() - 60_000).toISOString(),
      endedAt: options.endedAt ?? defaultEndedAt,
      shoeId: options.shoeId,
      surface: options.surface ?? 'treadmill',
      workoutType: options.workoutType ?? 'easy_run',
      painScore0To10: options.pain ?? 0,
    },
    context: {
      ...record.context,
      shoeId: options.shoeId,
      surface: options.surface ?? 'treadmill',
      workoutType: options.workoutType ?? 'easy_run',
      perceivedEffort0To10: options.effort ?? 4,
      painScore0To10: options.pain ?? 0,
    },
    metrics: {
      ...record.metrics,
      confidence: {
        ...record.metrics.confidence,
        level: scoreShowable ? 'high' : 'blocked',
        score: confidenceScore,
        scoreShowable,
        blocking: scoreShowable ? [] : ['test_blocked_run'],
      },
      mechanicalLoad: {
        ...record.metrics.mechanicalLoad,
        value: {
          ...record.metrics.mechanicalLoad.value,
          score0To100: mechanical,
        },
      },
      perceivedLoad: {
        ...record.metrics.perceivedLoad,
        value: {
          ...record.metrics.perceivedLoad.value,
          score0To100: perceived,
          rpe0To10: options.effort ?? 4,
          rawRpeMinutes: options.effort == null ? record.metrics.perceivedLoad.value.rawRpeMinutes : options.effort,
        },
      },
      totalTrainingLoad: {
        ...record.metrics.totalTrainingLoad,
        value: {
          ...record.metrics.totalTrainingLoad.value,
          score0To100: total,
          mechanicalScore0To100: mechanical,
          perceivedScore0To100: perceived,
        },
      },
      trainingStrain: {
        ...record.metrics.trainingStrain,
        value: total,
      },
      fatigueShift: {
        ...record.metrics.fatigueShift,
        value: fatigue,
      },
      categoryScores: {
        ...record.metrics.categoryScores,
        impactLoad: {
          ...record.metrics.categoryScores.impactLoad,
          value: impact,
        },
        loadBalance: {
          ...record.metrics.categoryScores.loadBalance,
          value: balance,
        },
        fatigueShift: {
          ...record.metrics.categoryScores.fatigueShift,
          value: Math.max(0, fatigue),
        },
      },
    },
  };
}

function scoreFor(history: BetaSessionRecord[], shoeId: string) {
  const score = buildShoeScores(history, shoesForTest()).find((item) => item.shoeId === shoeId);
  expect(score).toBeDefined();
  return score!;
}

describe('mobile shoe comparison score', () => {
  it('ranks a lower-load lower-effort shoe higher within matched conditions', () => {
    const history = [
      makeRecord({ id: 'a-1', shoeId: 'shoe-a', mechanical: 62, perceived: 50, pain: 3, impact: 55, balance: 58, fatigue: 5 }),
      makeRecord({ id: 'a-2', shoeId: 'shoe-a', mechanical: 64, perceived: 50, pain: 3, impact: 57, balance: 56, fatigue: 5 }),
      makeRecord({ id: 'a-3', shoeId: 'shoe-a', mechanical: 61, perceived: 50, pain: 3, impact: 54, balance: 60, fatigue: 5 }),
      makeRecord({ id: 'b-1', shoeId: 'shoe-b', mechanical: 34, perceived: 30, pain: 1, impact: 24, balance: 84, fatigue: 1 }),
      makeRecord({ id: 'b-2', shoeId: 'shoe-b', mechanical: 36, perceived: 30, pain: 1, impact: 26, balance: 82, fatigue: 1 }),
      makeRecord({ id: 'b-3', shoeId: 'shoe-b', mechanical: 35, perceived: 30, pain: 1, impact: 25, balance: 83, fatigue: 1 }),
    ];

    const daily = scoreFor(history, 'shoe-a');
    const stable = scoreFor(history, 'shoe-b');

    expect(stable.score).toBeGreaterThan(daily.score + 15);
    expect(stable.adjustedLoad).toBeLessThan(daily.adjustedLoad);
  });

  it('keeps unmatched terrain and workout load raw until peer comparisons exist', () => {
    const history = [
      makeRecord({ id: 'hard-trail', shoeId: 'shoe-a', surface: 'trail', workoutType: 'tempo', effort: 8, mechanical: 90, perceived: 80, pain: 2, impact: 70 }),
      makeRecord({ id: 'easy-1', shoeId: 'shoe-b', surface: 'treadmill', workoutType: 'easy_run', effort: 3, mechanical: 30, perceived: 25, pain: 0, impact: 20 }),
      makeRecord({ id: 'easy-2', shoeId: 'shoe-b', surface: 'treadmill', workoutType: 'easy_run', effort: 3, mechanical: 32, perceived: 25, pain: 0, impact: 22 }),
      makeRecord({ id: 'easy-3', shoeId: 'shoe-b', surface: 'treadmill', workoutType: 'easy_run', effort: 3, mechanical: 31, perceived: 25, pain: 0, impact: 21 }),
    ];

    const hardTrail = scoreFor(history, 'shoe-a');

    expect(hardTrail.adjustedLoad).toBeGreaterThan(80);
    expect(hardTrail.confidence).toBe('early');
  });

  it('does not let one bad-feeling run dominate an otherwise good shoe history', () => {
    const goodShoeRuns = [
      makeRecord({ id: 'a-good-1', shoeId: 'shoe-a', mechanical: 30, perceived: 30, pain: 1, impact: 20, balance: 86, fatigue: 1 }),
      makeRecord({ id: 'a-good-2', shoeId: 'shoe-a', mechanical: 31, perceived: 30, pain: 1, impact: 21, balance: 84, fatigue: 1 }),
      makeRecord({ id: 'a-good-3', shoeId: 'shoe-a', mechanical: 29, perceived: 30, pain: 1, impact: 19, balance: 85, fatigue: 1 }),
      makeRecord({ id: 'a-good-4', shoeId: 'shoe-a', mechanical: 30, perceived: 30, pain: 1, impact: 20, balance: 85, fatigue: 1 }),
      makeRecord({ id: 'a-outlier', shoeId: 'shoe-a', mechanical: 100, perceived: 90, pain: 10, impact: 100, balance: 20, fatigue: 25 }),
    ];
    const mediocreRuns = [
      makeRecord({ id: 'b-1', shoeId: 'shoe-b', mechanical: 45, perceived: 40, pain: 2, impact: 35, balance: 74, fatigue: 3 }),
      makeRecord({ id: 'b-2', shoeId: 'shoe-b', mechanical: 46, perceived: 40, pain: 2, impact: 36, balance: 75, fatigue: 3 }),
      makeRecord({ id: 'b-3', shoeId: 'shoe-b', mechanical: 44, perceived: 40, pain: 2, impact: 34, balance: 76, fatigue: 3 }),
      makeRecord({ id: 'b-4', shoeId: 'shoe-b', mechanical: 45, perceived: 40, pain: 2, impact: 35, balance: 75, fatigue: 3 }),
      makeRecord({ id: 'b-5', shoeId: 'shoe-b', mechanical: 45, perceived: 40, pain: 2, impact: 35, balance: 75, fatigue: 3 }),
    ];

    const goodShoe = scoreFor([...goodShoeRuns, ...mediocreRuns], 'shoe-a');
    const mediocreShoe = scoreFor([...goodShoeRuns, ...mediocreRuns], 'shoe-b');

    expect(goodShoe.score).toBeGreaterThan(mediocreShoe.score);
    expect(goodShoe.pain).toBeLessThanOrEqual(1.1);
    expect(goodShoe.confidence).toBe('strong');
  });

  it('ignores blocked low-confidence runs instead of using them in shoe scores', () => {
    const validOnly = [
      makeRecord({ id: 'valid', shoeId: 'shoe-a', mechanical: 30, perceived: 30, pain: 0, impact: 20, balance: 85, fatigue: 1 }),
    ];
    const withBlocked = [
      ...validOnly,
      makeRecord({ id: 'blocked', shoeId: 'shoe-a', mechanical: 100, perceived: 100, pain: 10, impact: 100, balance: 5, fatigue: 40, scoreShowable: false }),
    ];

    expect(scoreFor(withBlocked, 'shoe-a').score).toBe(scoreFor(validOnly, 'shoe-a').score);
  });

  it('returns bounded finite scores when user-entered context or metric values are odd', () => {
    const history = [
      makeRecord({ id: 'odd', shoeId: 'shoe-a', mechanical: 250, perceived: -10, pain: 99, impact: Number.NaN, balance: -50, fatigue: -500 }),
    ];

    const score = scoreFor(history, 'shoe-a');

    expect(Number.isFinite(score.score)).toBe(true);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.adjustedLoad).toBeLessThanOrEqual(100);
    expect(score.pain).toBeLessThanOrEqual(10);
    expect(score.balance).toBeGreaterThanOrEqual(0);
  });
});
