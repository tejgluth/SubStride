import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeSimulatorCalibration } from '../analytics/src';
import { computeSessionAnalyticsFromSslog, packetLossFromSequenceGaps } from '../mobile-app/src/services/sessionAnalytics';

describe('mobile sslog import pipeline', () => {
  it('decodes, validates, calibrates, and computes metrics from downloaded sslog bytes', () => {
    const bytes = readFileSync(join(process.cwd(), 'sample-data', 'normal_easy_run.sslog'));
    const result = computeSessionAnalyticsFromSslog(bytes, makeSimulatorCalibration('SIM-LEFT', 'left'));

    expect(result.validation.ok).toBe(true);
    expect(result.frames.length).toBe(result.decoded.frames.length);
    expect(result.metrics.trainingStrain.value).toBeGreaterThanOrEqual(0);
    expect(result.metrics.confidence.scoreShowable).toBe(true);
  });

  it('converts sequence gaps to a packet-loss fraction', () => {
    expect(packetLossFromSequenceGaps({ sequenceGaps: 2 } as any, 8)).toBe(0.2);
  });
});
