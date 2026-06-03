import { describe, expect, it } from 'vitest';
import {
  addShoeProfile,
  buildRunComputation,
  connectionSummary,
  createDefaultBetaAppState,
  setPodConnection,
} from '../mobile-app/src/domain/betaAppModel';

describe('mobile beta app model', () => {
  it('reports two-pod mode for the default simulator setup', () => {
    const state = createDefaultBetaAppState();

    expect(connectionSummary(state.pods)).toEqual({
      connectedCount: 2,
      leftConnected: true,
      rightConnected: true,
      mode: 'two_pods',
    });
  });

  it('supports one-pod mode and only emits data for the connected foot', () => {
    const state = createDefaultBetaAppState();
    state.pods = setPodConnection(state.pods, 'SIM-RIGHT', 'disconnected');

    const computed = buildRunComputation(state, 'normal_easy_run', { durationSeconds: 5 });
    const feetWithData = new Set(computed.frames.map((frame) => frame.foot));

    expect(connectionSummary(state.pods).mode).toBe('one_pod');
    expect(feetWithData).toEqual(new Set(['left']));
    expect(computed.metrics.foot).toBe('left');
  });

  it('attaches shoe, surface, workout, pain, and effort context to a synced session', () => {
    const state = createDefaultBetaAppState();
    const secondShoe = addShoeProfile(state.shoes, {
      id: 'shoe-carbon-racer',
      name: 'Carbon racer',
      brand: 'RaceCo',
      model: 'Fast 1',
    });
    state.shoes = [...state.shoes, secondShoe];
    state.sessionContext = {
      ...state.sessionContext,
      shoeId: secondShoe.id,
      surface: 'road',
      workoutType: 'tempo',
      painScore0To10: 2,
      perceivedEffort0To10: 7,
    };

    const computed = buildRunComputation(state, 'forefoot_overload', { durationSeconds: 5 });

    expect(computed.activeShoe?.id).toBe(secondShoe.id);
    expect(computed.sessionRecord.session.shoeId).toBe(secondShoe.id);
    expect(computed.sessionRecord.session.surface).toBe('road');
    expect(computed.sessionRecord.session.workoutType).toBe('tempo');
    expect(computed.sessionRecord.session.painScore0To10).toBe(2);
    expect(computed.context.perceivedEffort0To10).toBe(7);
  });

  it('builds baseline history from matching saved sessions', () => {
    const state = createDefaultBetaAppState();

    for (let i = 0; i < 3; i += 1) {
      const computed = buildRunComputation(state, 'normal_easy_run', { durationSeconds: 5 });
      state.sessionHistory = [...state.sessionHistory, computed.sessionRecord];
    }

    const computed = buildRunComputation(state, 'normal_easy_run', { durationSeconds: 5 });

    expect(computed.baseline.includedRunCount).toBe(3);
    expect(computed.baseline.status).toBe('baseline_enabled');
    expect(computed.history).toHaveLength(4);
  });

  it('exposes timestamp-aware longitudinal load for the trends screen', () => {
    const state = createDefaultBetaAppState();
    const first = buildRunComputation(state, 'normal_easy_run', {
      durationSeconds: 45,
      asOf: '2026-06-01T12:00:00.000Z',
    });
    state.sessionHistory = [first.sessionRecord];

    const near = buildRunComputation(state, 'normal_easy_run', {
      durationSeconds: 45,
      asOf: '2026-06-01T14:00:00.000Z',
    });
    const later = buildRunComputation(state, 'normal_easy_run', {
      durationSeconds: 45,
      asOf: '2026-06-06T12:00:00.000Z',
    });

    expect(near.longitudinalLoad.total.acute).toBeGreaterThan(later.longitudinalLoad.total.acute);
    expect(near.longitudinalLoad.timeline.at(-1)?.sessionId).toBeUndefined();
  });
});
