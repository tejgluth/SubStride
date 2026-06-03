import { describe, expect, it } from "vitest";
import { applyCalibration } from "../src/calibration";
import { computeRunMetrics } from "../src/metrics";
import { generateSimulatorSession, makeSimulatorCalibration } from "../src/simulator";
import {
  AI_ALLOWED_METRIC_KEYS,
  buildAiPayload,
  buildOpenAiExplanationPrompt,
  canShowAiExplanation,
  findDisallowedAiPayloadKeys,
  assertPromptDoesNotRequestInventedMetrics,
} from "../src/explanations";

function cleanMetrics(durationSeconds = 30) {
  const session = generateSimulatorSession("normal_easy_run", { durationSeconds });
  return computeRunMetrics(applyCalibration(session.frames, makeSimulatorCalibration()), {});
}

describe("AI guardrails", () => {
  it("payload contains ONLY whitelisted keys and no raw signals", () => {
    const payload = buildAiPayload({ metrics: cleanMetrics() });
    expect(findDisallowedAiPayloadKeys(payload)).toEqual([]);
    expect("frames" in payload).toBe(false);
    expect("steps" in payload).toBe(false);
    expect("pressureRaw" in payload).toBe(false);
    expect("accel" in payload).toBe(false);
    for (const key of Object.keys(payload)) {
      expect(AI_ALLOWED_METRIC_KEYS).toContain(key);
    }
  });

  it("a blocked score is sent as null/blocked, never as a fabricated number", () => {
    const short = generateSimulatorSession("normal_easy_run", { durationSeconds: 3 });
    const blocked = computeRunMetrics(applyCalibration(short.frames, makeSimulatorCalibration()), {});
    const payload = buildAiPayload({ metrics: blocked }) as any;
    expect(payload.trainingStrain.value).toBeNull();
    expect(payload.trainingStrain.blocked).toBe(true);
  });

  it("system prompt forbids invention, diagnosis, and clinical movement terms", () => {
    const prompt = buildOpenAiExplanationPrompt({ metrics: cleanMetrics() });
    const sys = prompt.system.toLowerCase();
    expect(assertPromptDoesNotRequestInventedMetrics(prompt)).toBe(true);
    expect(sys).toContain("do not diagnose");
    expect(sys).toContain("pronation"); // it is named as a FORBIDDEN term
    expect(sys).toContain("do not use clinical movement terms");
    expect(sys).toContain("do not compute");
    expect(prompt.promptVersion).toBeTruthy();
  });

  it("the user prompt carries no raw frame/pressure data", () => {
    const prompt = buildOpenAiExplanationPrompt({ metrics: cleanMetrics() });
    expect(prompt.user).not.toContain("pressureRaw");
    expect(prompt.user).not.toContain("\"accel\"");
  });

  it("canShowAiExplanation gates missing/invalid metrics", () => {
    expect(canShowAiExplanation(cleanMetrics())).toBe(true);
    expect(canShowAiExplanation(undefined)).toBe(false);
    const broken = { ...cleanMetrics(), trainingStrain: { ...cleanMetrics().trainingStrain, value: NaN } };
    expect(canShowAiExplanation(broken as any)).toBe(false);
  });
});
