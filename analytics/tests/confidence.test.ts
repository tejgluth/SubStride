import { describe, expect, it } from "vitest";
import { applyCalibration } from "../src/calibration";
import { computeRunMetrics, computeConfidence } from "../src/metrics";
import { generateSimulatorSession, makeSimulatorCalibration } from "../src/simulator";

function metricsFor(durationSeconds: number, quality: "pass" | "warn" | "fail", extra = {}) {
  const session = generateSimulatorSession("normal_easy_run", { durationSeconds });
  const calibration = { ...makeSimulatorCalibration(), quality };
  const frames = applyCalibration(session.frames, calibration);
  return computeRunMetrics(frames, { calibrationQuality: quality, ...extra });
}

describe("confidence scoring + gating", () => {
  it("clean long run is high confidence and shows the score", () => {
    const m = metricsFor(40, "pass");
    expect(m.confidence.level).toBe("high");
    expect(m.confidence.scoreShowable).toBe(true);
  });

  it("failed calibration blocks the score", () => {
    const m = metricsFor(40, "fail");
    expect(m.confidence.level).toBe("blocked");
    expect(m.confidence.scoreShowable).toBe(false);
    expect(m.confidence.blocking).toContain("calibration_failed");
    expect(m.trainingStrain.reasonCodes).toContain("score_blocked_low_confidence");
  });

  it("a too-short run blocks the score", () => {
    const m = metricsFor(3, "pass");
    expect(m.confidence.level).toBe("blocked");
    expect(m.confidence.blocking.some((b) => b === "insufficient_steps" || b === "run_too_short")).toBe(true);
  });

  it("warnings + packet loss + a bad channel reduce but do not block", () => {
    const m = metricsFor(40, "warn", { packetLossEstimate: 0.2, badChannelCount: 1 });
    expect(m.confidence.scoreShowable).toBe(true);
    expect(["low", "moderate"]).toContain(m.confidence.level);
    expect(m.confidence.reasonCodes).toEqual(expect.arrayContaining(["calibration_warning", "elevated_packet_loss", "bad_channels_present"]));
  });

  it("severe packet loss blocks the score", () => {
    const m = metricsFor(40, "pass", { packetLossEstimate: 0.6 });
    expect(m.confidence.level).toBe("blocked");
    expect(m.confidence.blocking).toContain("severe_packet_loss");
  });

  it("too many bad channels blocks the score", () => {
    const m = metricsFor(40, "pass", { badChannelCount: 3 });
    expect(m.confidence.level).toBe("blocked");
    expect(m.confidence.blocking).toContain("too_many_bad_channels");
  });

  it("computeConfidence is deterministic and ranks levels sensibly", () => {
    const base = {
      calibrationQuality: "pass" as const,
      stepCount: 60,
      durationSeconds: 60,
      measuredSampleRateHz: 100,
      expectedSampleRateHz: 100,
      packetLossEstimate: 0,
      badChannelCount: 0,
      highLoadFlagFraction: 0,
      leftFootUnverified: false,
      singleFoot: false,
      baselineStatus: "mature" as const,
    };
    expect(computeConfidence(base).level).toBe("high");
    expect(computeConfidence({ ...base, calibrationQuality: "warn", badChannelCount: 2 }).score)
      .toBeLessThan(computeConfidence(base).score);
  });
});
