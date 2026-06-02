import { describe, expect, it } from "vitest";
import { applyCalibration, buildCalibrationProfile, detectBadChannels } from "../src/calibration";
import { generateSimulatorSession, makeSimulatorCalibration } from "../src/simulator";
import type { RawFrame } from "../src/types";

function frameWithChannel(value: number, channel = 0): RawFrame {
  const pressureRaw = new Array(16).fill(120);
  pressureRaw[channel] = value;
  return {
    sessionId: "test",
    podId: "pod",
    foot: "left",
    sequence: 0,
    timestampMs: 0,
    pressureRaw,
    accel: [0, 0, 1],
    gyro: [0, 0, 0],
    flags: 0
  };
}

describe("calibration", () => {
  it("applies offset and gain transforms to raw pressure frames", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 1 });
    const calibrated = applyCalibration(session.frames.slice(0, 5), makeSimulatorCalibration());
    expect(calibrated[0].relativeLoad).toHaveLength(16);
    expect(calibrated.some((frame) => frame.totalLoad > 0)).toBe(true);
  });

  it("detects saturated and non-responsive channels", () => {
    const noLoad = Array.from({ length: 30 }, () => frameWithChannel(4095));
    const dynamic = Array.from({ length: 30 }, () => frameWithChannel(4095));
    const findings = detectBadChannels(noLoad, dynamic);
    expect(findings.some((finding) => finding.zoneIndex === 0 && finding.codes.includes("saturated"))).toBe(true);
  });

  it("marks calibration as fail when bad channels are present", () => {
    const noLoad = Array.from({ length: 30 }, () => frameWithChannel(4095));
    const dynamic = Array.from({ length: 30 }, () => frameWithChannel(4095));
    const profile = buildCalibrationProfile({ id: "cal", podId: "pod", foot: "left", noLoadFrames: noLoad, dynamicFrames: dynamic });
    expect(profile.quality).toBe("fail");
  });
});
