import { describe, expect, it } from "vitest";
import { detectBadChannels, summarizeZones, buildCalibrationProfile, applyCalibration } from "../src/calibration";
import { detectGaitEvents, segmentSteps } from "../src/gait";
import { computeRunMetrics } from "../src/metrics";
import { generateSimulatorSession, makeSimulatorCalibration } from "../src/simulator";
import type { RawFrame } from "../src/types";

function frames(values: (i: number) => number[], count = 40): RawFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    sessionId: "t",
    podId: "pod",
    foot: "right" as const,
    sequence: i,
    timestampMs: i * 10,
    pressureRaw: values(i),
    accel: [0, 0, 1] as [number, number, number],
    gyro: [0, 0, 0] as [number, number, number],
    flags: 0,
  }));
}

describe("signal quality / calibration robustness", () => {
  it("detects a stuck-low (dead) channel", () => {
    const noLoad = frames(() => { const a = new Array(16).fill(120); a[4] = 0; return a; });
    const dynamic = frames(() => { const a = new Array(16).fill(800); a[4] = 0; return a; });
    const findings = detectBadChannels(noLoad, dynamic);
    expect(findings.some((f) => f.zoneIndex === 4 && f.codes.includes("stuck_low"))).toBe(true);
  });

  it("detects a no-dynamic-response channel", () => {
    const noLoad = frames(() => { const a = new Array(16).fill(120); a[7] = 130; return a; });
    const dynamic = frames(() => { const a = new Array(16).fill(900); a[7] = 132; return a; }); // barely moves
    const findings = detectBadChannels(noLoad, dynamic);
    expect(findings.some((f) => f.zoneIndex === 7 && f.codes.includes("no_dynamic_response"))).toBe(true);
  });

  it("detects excessive noise", () => {
    const noLoad = frames((i) => { const a = new Array(16).fill(120); a[2] = 120 + (i % 2 === 0 ? 120 : -120); return a; });
    const dynamic = frames(() => new Array(16).fill(900));
    const stats = summarizeZones(noLoad, dynamic);
    expect(stats[2].flags).toContain("too_noisy");
  });

  it("all-zero channels produce a failing calibration, which blocks the score", () => {
    const noLoad = frames(() => new Array(16).fill(0));
    const dynamic = frames(() => new Array(16).fill(0));
    const profile = buildCalibrationProfile({ id: "c", podId: "p", foot: "right", noLoadFrames: noLoad, dynamicFrames: dynamic });
    expect(profile.quality).toBe("fail");

    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 30 });
    const calibrated = applyCalibration(session.frames, { ...profile, foot: "right" });
    const metrics = computeRunMetrics(calibrated, { calibrationQuality: profile.quality, badChannelCount: profile.badChannels.length });
    expect(metrics.confidence.scoreShowable).toBe(false);
  });
});

describe("gait detection robustness", () => {
  it("detects strikes and toe-offs on a normal synthetic run", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 8 });
    const calibrated = applyCalibration(session.frames, makeSimulatorCalibration());
    const events = detectGaitEvents(calibrated);
    expect(events.filter((e) => e.type === "foot_strike").length).toBeGreaterThan(5);
    expect(events.filter((e) => e.type === "toe_off").length).toBeGreaterThan(5);
  });

  it("does not toggle stance on a single spurious spike during swing", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 8 });
    const calibrated = applyCalibration(session.frames, makeSimulatorCalibration());
    const baseline = segmentSteps(calibrated).length;
    // Inject one-frame spikes deep in swing phases.
    const spiked = calibrated.map((f, i) => (i % 97 === 0 ? { ...f, totalLoad: f.totalLoad + 5000 } : f));
    const spikedSteps = segmentSteps(spiked).length;
    // A single-frame spike must not roughly double the detected step count.
    expect(spikedSteps).toBeLessThan(baseline * 1.5 + 2);
  });

  it("event timestamps align with real frame timestamps (no off-by-one frame)", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 6 });
    const calibrated = applyCalibration(session.frames, makeSimulatorCalibration());
    const validTimestamps = new Set(calibrated.map((f) => f.timestampMs));
    for (const event of detectGaitEvents(calibrated)) {
      expect(validTimestamps.has(event.timestampMs)).toBe(true);
    }
  });

  it("handles a pause (no contact) without inventing steps", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 6 });
    const calibrated = applyCalibration(session.frames, makeSimulatorCalibration());
    // Force a 1.5 s pause in the middle (no load).
    const mid = Math.floor(calibrated.length / 2);
    const paused = calibrated.map((f, i) => (i >= mid && i < mid + 150 ? { ...f, totalLoad: 0, relativeLoad: new Array(16).fill(0) } : f));
    const steps = segmentSteps(paused);
    expect(steps.every((s) => s.durationMs > 0 && s.durationMs < 2000)).toBe(true);
  });
});
