import type { CalibratedFrame, GaitEvent, StepSegment } from "./types";

export interface GaitDetectionOptions {
  strikeThreshold?: number;
  toeOffThreshold?: number;
  minContactMs?: number;
  minSwingMs?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function movingAverage(frames: CalibratedFrame[], windowSize: number): number[] {
  const totals = frames.map((frame) => frame.totalLoad);
  return totals.map((_, index) => {
    const start = Math.max(0, index - windowSize);
    const end = Math.min(totals.length, index + windowSize + 1);
    const window = totals.slice(start, end);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

export function detectGaitEvents(frames: CalibratedFrame[], options: GaitDetectionOptions = {}): GaitEvent[] {
  if (frames.length < 3) return [];
  const smooth = movingAverage(frames, 2);
  const activeLoads = smooth.filter((value) => value > 10);
  const adaptiveThreshold = Math.max(60, median(activeLoads) * 0.25);
  const strikeThreshold = options.strikeThreshold ?? adaptiveThreshold;
  const toeOffThreshold = options.toeOffThreshold ?? strikeThreshold * 0.55;
  const minContactMs = options.minContactMs ?? 80;
  const minSwingMs = options.minSwingMs ?? 120;

  const events: GaitEvent[] = [];
  let inContact = false;
  let lastStrikeMs = -Infinity;
  let lastToeOffMs = -Infinity;
  let contactStartIndex = -1;
  let peakIndex = -1;
  let peakLoad = 0;

  for (let i = 1; i < frames.length; i += 1) {
    const frame = frames[i];
    const previous = smooth[i - 1];
    const current = smooth[i];

    if (!inContact && previous < strikeThreshold && current >= strikeThreshold && frame.timestampMs - lastToeOffMs >= minSwingMs) {
      inContact = true;
      contactStartIndex = i;
      peakIndex = i;
      peakLoad = current;
      lastStrikeMs = frame.timestampMs;
      events.push({
        type: "foot_strike",
        timestampMs: frame.timestampMs,
        sequence: frame.sequence,
        reasonCodes: ["load_threshold_crossing"]
      });
    }

    if (inContact && current > peakLoad) {
      peakLoad = current;
      peakIndex = i;
    }

    if (inContact && previous > toeOffThreshold && current <= toeOffThreshold && frame.timestampMs - lastStrikeMs >= minContactMs) {
      const peakFrame = frames[peakIndex] ?? frames[contactStartIndex] ?? frame;
      events.push({
        type: "midstance",
        timestampMs: peakFrame.timestampMs,
        sequence: peakFrame.sequence,
        reasonCodes: ["peak_load_during_contact"]
      });
      events.push({
        type: "toe_off",
        timestampMs: frame.timestampMs,
        sequence: frame.sequence,
        reasonCodes: ["load_threshold_release"]
      });
      inContact = false;
      lastToeOffMs = frame.timestampMs;
    }
  }

  return events;
}

export function segmentSteps(frames: CalibratedFrame[], events = detectGaitEvents(frames)): StepSegment[] {
  const steps: StepSegment[] = [];
  const strikes = events.filter((event) => event.type === "foot_strike");
  const toeOffs = events.filter((event) => event.type === "toe_off");
  const midstances = events.filter((event) => event.type === "midstance");

  for (const strike of strikes) {
    const toeOff = toeOffs.find((event) => event.timestampMs > strike.timestampMs);
    if (!toeOff) continue;
    const midstance = midstances.find((event) => event.timestampMs >= strike.timestampMs && event.timestampMs <= toeOff.timestampMs);
    const contactFrames = frames.filter((frame) => frame.timestampMs >= strike.timestampMs && frame.timestampMs <= toeOff.timestampMs);
    if (contactFrames.length === 0) continue;
    const peakLoad = Math.max(...contactFrames.map((frame) => frame.totalLoad));
    const impulseProxy = contactFrames.reduce((sum, frame, index) => {
      const previous = contactFrames[index - 1];
      const dtSeconds = previous ? (frame.timestampMs - previous.timestampMs) / 1000 : 0.01;
      return sum + frame.totalLoad * dtSeconds;
    }, 0);
    const firstTwo = contactFrames.slice(0, Math.max(2, Math.ceil(contactFrames.length * 0.15)));
    const loadRateProxy = firstTwo.length > 1
      ? (Math.max(...firstTwo.map((frame) => frame.totalLoad)) - firstTwo[0].totalLoad) / Math.max(0.001, (firstTwo[firstTwo.length - 1].timestampMs - firstTwo[0].timestampMs) / 1000)
      : 0;
    steps.push({
      startMs: strike.timestampMs,
      midstanceMs: midstance?.timestampMs ?? strike.timestampMs + (toeOff.timestampMs - strike.timestampMs) / 2,
      endMs: toeOff.timestampMs,
      durationMs: toeOff.timestampMs - strike.timestampMs,
      contactTimeMs: toeOff.timestampMs - strike.timestampMs,
      peakLoad,
      impulseProxy,
      loadRateProxy,
      foot: contactFrames[0].foot
    });
  }

  return steps;
}
