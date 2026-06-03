import { describe, expect, it } from "vitest";
import { applyCalibration } from "../src/calibration";
import { computeRunMetrics, combineFootMetrics } from "../src/metrics";
import { generateSimulatorSession, makeSimulatorCalibration } from "../src/simulator";
import type { CalibrationProfile } from "../src/types";

function strainFor(scenario: any, calibration: CalibrationProfile, durationSeconds = 40) {
  const session = generateSimulatorSession(scenario, { durationSeconds });
  const frames = applyCalibration(session.frames, calibration);
  return computeRunMetrics(frames, { calibrationQuality: "pass" });
}

describe("Training Strain correctness", () => {
  it("is INVARIANT to calibration gain (the old formula was not)", () => {
    const gain1 = makeSimulatorCalibration();
    const gain2: CalibrationProfile = { ...gain1, zoneGains: new Array(16).fill(2) };
    const gain05: CalibrationProfile = { ...gain1, zoneGains: new Array(16).fill(0.5) };
    const s1 = strainFor("heel_impact_spike", gain1).trainingStrain.value;
    const s2 = strainFor("heel_impact_spike", gain2).trainingStrain.value;
    const s3 = strainFor("heel_impact_spike", gain05).trainingStrain.value;
    expect(Math.abs(s1 - s2)).toBeLessThanOrEqual(2);
    expect(Math.abs(s1 - s3)).toBeLessThanOrEqual(2);
  });

  it("is directional: a heel-impact run scores higher than a normal easy run", () => {
    const cal = makeSimulatorCalibration();
    expect(strainFor("heel_impact_spike", cal).trainingStrain.value)
      .toBeGreaterThan(strainFor("normal_easy_run", cal).trainingStrain.value);
  });

  it("a fatiguing run scores higher than a steady easy run", () => {
    const cal = makeSimulatorCalibration();
    expect(strainFor("fatigued_long_run", cal).trainingStrain.value)
      .toBeGreaterThan(strainFor("normal_easy_run", cal).trainingStrain.value);
  });

  it("stays within 0-100 and a normal run does not collapse to the extreme", () => {
    const cal = makeSimulatorCalibration();
    const v = strainFor("normal_easy_run", cal).trainingStrain.value;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(70); // a normal easy run must not look like a max-strain session
  });

  it("is deterministic (same input => same score)", () => {
    const cal = makeSimulatorCalibration();
    expect(strainFor("forefoot_overload", cal).trainingStrain.value)
      .toBe(strainFor("forefoot_overload", cal).trainingStrain.value);
  });

  it("is stable: a small duration change moves the score only slightly", () => {
    const cal = makeSimulatorCalibration();
    const a = strainFor("normal_easy_run", cal, 40).trainingStrain.value;
    const b = strainFor("normal_easy_run", cal, 42).trainingStrain.value;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(5);
  });

  it("medial/lateral imbalance does NOT inflate Training Strain (it shows in balance instead)", () => {
    const cal = makeSimulatorCalibration();
    const normal = strainFor("normal_easy_run", cal);
    const imbalance = strainFor("medial_lateral_imbalance", cal);
    // imbalance should not be dramatically higher strain just because more load was added
    expect(imbalance.trainingStrain.value).toBeLessThanOrEqual(normal.trainingStrain.value + 10);
    expect(imbalance.medialLateralBalance.value).toBeLessThan(normal.medialLateralBalance.value);
  });

  it("combines two feet by SUMMING cadence (not averaging) and exposes asymmetry", () => {
    const cal = makeSimulatorCalibration();
    const left = computeRunMetrics(applyCalibration(generateSimulatorSession("normal_easy_run", { durationSeconds: 30, foot: "left" }).frames, makeSimulatorCalibration("SIM-LEFT", "left")), {});
    const right = computeRunMetrics(applyCalibration(generateSimulatorSession("normal_easy_run", { durationSeconds: 30, foot: "right" }).frames, makeSimulatorCalibration("SIM-RIGHT", "right")), {});
    const both = combineFootMetrics(left, right);
    const leftCad = left.cadence.value as number;
    const rightCad = right.cadence.value as number;
    expect(both.cadence.value).toBeCloseTo(leftCad + rightCad, 5); // SUM, not average
    expect(both.foot).toBe("both");
    expect(both.asymmetry).toBeDefined();
    expect(both.asymmetry?.experimental).toBe(true);
  });

  it("two-foot distribution averages both feet (not just the left)", () => {
    const left = computeRunMetrics(applyCalibration(generateSimulatorSession("normal_easy_run", { durationSeconds: 30, foot: "left" }).frames, makeSimulatorCalibration("SIM-LEFT", "left")), {});
    const right = computeRunMetrics(applyCalibration(generateSimulatorSession("forefoot_overload", { durationSeconds: 30, foot: "right" }).frames, makeSimulatorCalibration("SIM-RIGHT", "right")), {});
    const both = combineFootMetrics(left, right);
    const expectedHeel = ((left.heelMidForeToeDistribution.value.heel ?? 0) + (right.heelMidForeToeDistribution.value.heel ?? 0)) / 2;
    expect(both.heelMidForeToeDistribution.value.heel).toBeCloseTo(expectedHeel, 5);
  });

  it("impact proxy is rotation-invariant (gravity on any axis gives the same value)", () => {
    const session = generateSimulatorSession("heel_impact_spike", { durationSeconds: 20 });
    const cal = makeSimulatorCalibration();
    const upright = applyCalibration(session.frames, cal);
    // Re-orient: move the gravity/impact vector from Z to X. Magnitude-based impact must be identical.
    const rotated = upright.map((f) => ({ ...f, accel: [f.accel[2], f.accel[1], f.accel[0]] as [number, number, number] }));
    const a = computeRunMetrics(upright, {}).impactLoad.value;
    const b = computeRunMetrics(rotated, {}).impactLoad.value;
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });

  it("exposes beta Mechanical, Perceived, and Total Training Load streams", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 40 });
    const metrics = computeRunMetrics(applyCalibration(session.frames, makeSimulatorCalibration()), {
      perceivedEffort0To10: 5,
    });
    expect(metrics.mechanicalLoad.value.score0To100).toBe(metrics.totalTrainingLoad.value.mechanicalScore0To100);
    expect(metrics.perceivedLoad.value.rawRpeMinutes).toBeCloseTo(5 * (39990 / 60000), 1);
    expect(metrics.perceivedLoad.value.score0To100).not.toBeNull();
    expect(metrics.totalTrainingLoad.value.weights).toEqual({ mechanical: 0.75, perceived: 0.25 });
    expect(metrics.trainingStrain.value).toBe(metrics.totalTrainingLoad.value.score0To100);
  });

  it("uses a mechanical-only total when perceived effort is missing", () => {
    const metrics = strainFor("normal_easy_run", makeSimulatorCalibration());
    expect(metrics.perceivedLoad.value.score0To100).toBeNull();
    expect(metrics.totalTrainingLoad.value.missingStreams).toContain("perceived");
    expect(metrics.totalTrainingLoad.value.score0To100).toBe(metrics.mechanicalLoad.value.score0To100);
  });

  it("does not double-count perceived load when combining feet", () => {
    const left = computeRunMetrics(
      applyCalibration(generateSimulatorSession("normal_easy_run", { durationSeconds: 30, foot: "left" }).frames, makeSimulatorCalibration("SIM-LEFT", "left")),
      { perceivedEffort0To10: 6 }
    );
    const right = computeRunMetrics(
      applyCalibration(generateSimulatorSession("normal_easy_run", { durationSeconds: 30, foot: "right" }).frames, makeSimulatorCalibration("SIM-RIGHT", "right")),
      { perceivedEffort0To10: 6 }
    );
    const both = combineFootMetrics(left, right);
    expect(both.perceivedLoad.value.rawRpeMinutes).toBeCloseTo(left.perceivedLoad.value.rawRpeMinutes ?? 0, 5);
    expect(both.totalTrainingLoad.value.perceivedScore0To100).toBe(left.perceivedLoad.value.score0To100);
  });
});
