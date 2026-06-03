import { describe, expect, it } from "vitest";
import { buildBaseline } from "../src/baseline";
import { applyCalibration } from "../src/calibration";
import { buildOpenAiExplanationPrompt, assertPromptDoesNotRequestInventedMetrics } from "../src/explanations";
import { detectGaitEvents, segmentSteps } from "../src/gait";
import { computeRunMetrics } from "../src/metrics";
import { generateAllSimulatorSessions, generateSimulatorSession, makeSimulatorCalibration } from "../src/simulator";

describe("gait and metrics", () => {
  it("detects synthetic gait events and step segments", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 8 });
    const frames = applyCalibration(session.frames, makeSimulatorCalibration());
    const events = detectGaitEvents(frames);
    const steps = segmentSteps(frames, events);
    expect(events.some((event) => event.type === "foot_strike")).toBe(true);
    expect(events.some((event) => event.type === "toe_off")).toBe(true);
    expect(steps.length).toBeGreaterThan(5);
  });

  it("keeps Training Strain and category scores within 0-100", () => {
    const session = generateSimulatorSession("heel_impact_spike", { durationSeconds: 20 });
    const frames = applyCalibration(session.frames, makeSimulatorCalibration());
    const metrics = computeRunMetrics(frames, { calibrationQuality: "pass", shoeKnown: true });
    expect(metrics.trainingStrain.value).toBeGreaterThanOrEqual(0);
    expect(metrics.trainingStrain.value).toBeLessThanOrEqual(100);
    for (const category of Object.values(metrics.categoryScores)) {
      expect(category.value).toBeGreaterThanOrEqual(0);
      expect(category.value).toBeLessThanOrEqual(100);
    }
  });

  it("flags frames when calibration fails", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 20 });
    const calibration = { ...makeSimulatorCalibration(), quality: "fail" as const };
    const frames = applyCalibration(session.frames, calibration);
    expect(frames.some((frame) => frame.qualityFlags.includes("calibration_failed"))).toBe(true);
  });

  it("builds baseline after three clean runs and excludes pain-marked sessions", () => {
    const cleanRuns = ["normal_easy_run", "forefoot_overload", "heel_impact_spike"].map((scenario) => {
      const session = generateSimulatorSession(scenario as any, { durationSeconds: 20 });
      const frames = applyCalibration(session.frames, makeSimulatorCalibration());
      return { sessionId: session.id, userId: "user-1", metrics: computeRunMetrics(frames), calibrationQuality: "pass" as const };
    });
    const painSession = generateSimulatorSession("fatigued_long_run", { durationSeconds: 20 });
    const painFrames = applyCalibration(painSession.frames, makeSimulatorCalibration());
    const baseline = buildBaseline("user-1", [
      ...cleanRuns,
      { sessionId: painSession.id, userId: "user-1", metrics: computeRunMetrics(painFrames), calibrationQuality: "pass" as const, painScore0To10: 7 }
    ]);
    expect(baseline.status).toBe("baseline_enabled");
    expect(baseline.includedRunCount).toBe(3);
    expect(baseline.excludedSessionIds).toContain(painSession.id);
  });

  it("constrains the OpenAI prompt to computed metrics", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 10 });
    const frames = applyCalibration(session.frames, makeSimulatorCalibration());
    const prompt = buildOpenAiExplanationPrompt({ metrics: computeRunMetrics(frames) });
    expect(assertPromptDoesNotRequestInventedMetrics(prompt)).toBe(true);
    expect(prompt.system.toLowerCase()).toContain("do not diagnose");
  });

  it("simulator scenarios produce expected relative patterns", () => {
    const sessions = generateAllSimulatorSessions({ durationSeconds: 25 });
    const metricsByScenario = Object.fromEntries(
      sessions.map((session) => {
        const frames = applyCalibration(session.frames, makeSimulatorCalibration());
        return [session.scenario, computeRunMetrics(frames, { calibrationQuality: "pass", shoeKnown: true })];
      })
    );
    expect(metricsByScenario.forefoot_overload.categoryScores.forefootMetatarsalLoad.value)
      .toBeGreaterThan(metricsByScenario.normal_easy_run.categoryScores.forefootMetatarsalLoad.value);
    expect(metricsByScenario.heel_impact_spike.categoryScores.impactLoad.value)
      .toBeGreaterThan(metricsByScenario.normal_easy_run.categoryScores.impactLoad.value);
    expect(metricsByScenario.medial_lateral_imbalance.categoryScores.loadBalance.value)
      .toBeLessThan(metricsByScenario.normal_easy_run.categoryScores.loadBalance.value);
  });

  it("simulator heatmap inputs vary per zone instead of flat region blocks", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 20 });
    const frames = applyCalibration(session.frames, makeSimulatorCalibration());
    const sums = new Array(16).fill(0);

    for (const frame of frames) {
      frame.relativeLoad.forEach((value, zoneIndex) => {
        sums[zoneIndex] += value;
      });
    }

    const averages = sums.map((sum) => sum / frames.length);
    const rounded = averages.map((value) => value.toFixed(2));
    expect(new Set(rounded).size).toBeGreaterThanOrEqual(12);
  });
});
