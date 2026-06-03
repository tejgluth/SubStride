import { describe, expect, it } from "vitest";
import { resolveZoneMapForFoot, zoneMap } from "../src/zoneMap";
import { applyCalibration } from "../src/calibration";
import { makeSimulatorCalibration } from "../src/simulator";
import type { RawFrame } from "../src/types";

// Physically medial channels in the reference (right) layout: medial heel/arch/forefoot/toe.
const PHYSICAL_MEDIAL_CHANNELS = [0, 3, 6, 8, 13];

function frameWithMedialLoad(foot: "left" | "right"): RawFrame {
  const pressureRaw = new Array(16).fill(120); // offset baseline
  for (const ch of PHYSICAL_MEDIAL_CHANNELS) pressureRaw[ch] = 1200; // load the medial channels
  return {
    sessionId: "t",
    podId: `SIM-${foot.toUpperCase()}`,
    foot,
    sequence: 0,
    timestampMs: 0,
    pressureRaw,
    accel: [0, 0, 1],
    gyro: [0, 0, 0],
    flags: 0,
  };
}

describe("left/right zone mirroring", () => {
  it("right foot keeps reference medial/lateral labels", () => {
    const map = resolveZoneMapForFoot("right");
    expect(map[0].side).toBe("medial"); // z00 medial heel
    expect(map[2].side).toBe("lateral"); // z02 lateral heel
    expect(map).toBe(zoneMap);
  });

  it("left foot (mirrored) flips medial<->lateral but keeps the longitudinal region", () => {
    const map = resolveZoneMapForFoot("left", "mirrored");
    expect(map[0].side).toBe("lateral"); // medial heel pad sits on the lateral side of a mirror-wired left insole
    expect(map[2].side).toBe("medial");
    expect(map[0].region).toBe("heel"); // front/back axis unchanged
  });

  it("left foot (anatomical wiring) does NOT flip", () => {
    const map = resolveZoneMapForFoot("left", "anatomical");
    expect(map[0].side).toBe("medial");
  });

  it("the SAME physical channel loads map to OPPOSITE sides for left vs right (the core bug)", () => {
    const right = applyCalibration([frameWithMedialLoad("right")], makeSimulatorCalibration("SIM-RIGHT", "right"));
    const left = applyCalibration([frameWithMedialLoad("left")], makeSimulatorCalibration("SIM-LEFT", "left"));

    // Right foot: loading the medial channels loads the MEDIAL region total.
    expect(right[0].regionLoads.medial).toBeGreaterThan(right[0].regionLoads.lateral);
    // Left foot (mirrored default): the identical channel loads land on the LATERAL side.
    expect(left[0].regionLoads.lateral).toBeGreaterThan(left[0].regionLoads.medial);
  });

  it("left-foot frames are flagged as orientation-unverified for confidence", () => {
    const left = applyCalibration([frameWithMedialLoad("left")], makeSimulatorCalibration("SIM-LEFT", "left"));
    expect(left[0].qualityFlags).toContain("left_foot_orientation_unverified");
  });

  it("an explicit anatomical layout removes the flip and the flag", () => {
    const left = applyCalibration(
      [frameWithMedialLoad("left")],
      makeSimulatorCalibration("SIM-LEFT", "left"),
      { leftFootLayout: "anatomical" }
    );
    expect(left[0].regionLoads.medial).toBeGreaterThan(left[0].regionLoads.lateral);
    expect(left[0].qualityFlags).not.toContain("left_foot_orientation_unverified");
  });
});
