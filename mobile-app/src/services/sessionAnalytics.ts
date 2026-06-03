import {
  applyCalibration,
  computeRunMetrics,
  decodeSslog,
  validateDecodedSession,
  type CalibratedFrame,
  type CalibrationProfile,
  type ComputeMetricsOptions,
  type DecodedSessionValidation,
  type DecodedSslog,
  type RunMetrics,
} from '@substride/analytics';

export interface ImportedSessionAnalytics {
  decoded: DecodedSslog;
  validation: DecodedSessionValidation;
  frames: CalibratedFrame[];
  metrics: RunMetrics;
}

export function packetLossFromSequenceGaps(validation: DecodedSessionValidation, decodedFrameCount: number): number {
  const expectedFrames = decodedFrameCount + validation.sequenceGaps;
  return expectedFrames > 0 ? validation.sequenceGaps / expectedFrames : 0;
}

export function computeSessionAnalyticsFromSslog(
  bytes: Uint8Array,
  calibration: CalibrationProfile,
  options: Omit<ComputeMetricsOptions, 'calibrationQuality' | 'packetLossEstimate' | 'badChannelCount'> = {}
): ImportedSessionAnalytics {
  const decoded = decodeSslog(bytes, { allowPartial: true });
  const validation = validateDecodedSession(decoded);
  if (!validation.ok) {
    throw new Error(`Decoded session failed validation: ${validation.issues.join(', ')}`);
  }

  const frames = applyCalibration(decoded.frames, calibration);
  const metrics = computeRunMetrics(frames, {
    ...options,
    calibrationQuality: calibration.quality,
    badChannelCount: calibration.badChannels.length,
    packetLossEstimate: packetLossFromSequenceGaps(validation, decoded.frames.length),
  });

  return { decoded, validation, frames, metrics };
}
