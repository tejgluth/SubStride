import { describe, expect, it } from "vitest";
import { applyCalibration } from "../src/calibration";
import { computeLongitudinalTrainingLoad } from "../src/longitudinalLoad";
import { computeRunMetrics } from "../src/metrics";
import { generateSimulatorSession, makeSimulatorCalibration } from "../src/simulator";
import type { Session } from "../src/types";

function makeMetrics() {
  const raw = generateSimulatorSession("normal_easy_run", { durationSeconds: 45, foot: "right" });
  const calibration = makeSimulatorCalibration("SIM-RIGHT", "right");
  return computeRunMetrics(applyCalibration(raw.frames, calibration), {
    calibrationQuality: "pass",
    perceivedEffort0To10: 5,
    shoeKnown: true,
  });
}

function session(id: string, endedAt: string): Session {
  const endedMs = new Date(endedAt).getTime();
  return {
    id,
    userId: "user-1",
    createdAt: endedAt,
    startedAt: new Date(endedMs - 45_000).toISOString(),
    endedAt,
    source: "simulator",
    mode: "run",
    podSessionIds: [`pod-${id}`],
    syncStatus: "synced",
  };
}

describe("longitudinal training load", () => {
  it("decays current load with elapsed time from the same run timestamp", () => {
    const metrics = makeMetrics();
    const run = { session: session("run-1", "2026-06-01T12:00:00.000Z"), metrics };

    const twoHoursLater = computeLongitudinalTrainingLoad([run], { asOf: "2026-06-01T14:00:00.000Z" });
    const fiveDaysLater = computeLongitudinalTrainingLoad([run], { asOf: "2026-06-06T12:00:00.000Z" });

    expect(twoHoursLater.total.acute).toBeGreaterThan(fiveDaysLater.total.acute);
    expect(twoHoursLater.currentLoadScore0To100).toBeGreaterThan(fiveDaysLater.currentLoadScore0To100);
  });

  it("gates risk during cold start but still reports current load", () => {
    const metrics = makeMetrics();
    const load = computeLongitudinalTrainingLoad([
      { session: session("run-1", "2026-06-01T12:00:00.000Z"), metrics },
    ], { asOf: "2026-06-01T14:00:00.000Z" });

    expect(load.currentLoadScore0To100).toBeGreaterThan(0);
    expect(load.status).toBe("session_only");
    expect(load.riskSignal.value0To100).toBeNull();
    expect(load.riskSignal.reasonCodes).toContain("insufficient_history_no_risk_signal");
  });

  it("produces full rolling-load confidence after six weeks of timestamped runs", () => {
    const metrics = makeMetrics();
    const start = Date.UTC(2026, 3, 1, 12);
    const runs = Array.from({ length: 9 }, (_, index) => {
      const endedAt = new Date(start + index * 7 * 24 * 60 * 60 * 1000).toISOString();
      return { session: session(`run-${index}`, endedAt), metrics };
    });

    const load = computeLongitudinalTrainingLoad(runs, { asOf: "2026-06-03T12:00:00.000Z" });

    expect(load.status).toBe("full");
    expect(load.confidence).toBe("high");
    expect(load.riskSignal.value0To100).not.toBeNull();
    expect(load.timeline.at(-1)?.sessionId).toBeUndefined();
  });
});
