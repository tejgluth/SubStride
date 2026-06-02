import type { RunMetrics } from "./types";
import { scoreCategory } from "./metrics";

export function deterministicExplanation(metrics: RunMetrics): string {
  const strainCategory = scoreCategory(metrics.trainingStrain.value);
  return [
    `Training Strain is ${metrics.trainingStrain.value}/100 (${strainCategory}).`,
    `This is based on relative load, peak load, load-rate proxy, impact proxy, fatigue shift, and personal baseline data when available.`,
    `These are beta load and gait indicators, not a diagnosis or medical-grade injury prediction.`
  ].join(" ");
}

export interface AiPromptInput {
  metrics: RunMetrics;
  profileContext?: {
    shoe?: string;
    surface?: string;
    workoutType?: string;
    painScore0To10?: number;
  };
}

export function buildOpenAiExplanationPrompt(input: AiPromptInput): { system: string; user: string } {
  const allowedMetrics = {
    sessionId: input.metrics.sessionId,
    foot: input.metrics.foot,
    trainingStrain: input.metrics.trainingStrain,
    cadence: input.metrics.cadence,
    contactTime: input.metrics.contactTime,
    totalRelativeLoad: input.metrics.totalRelativeLoad,
    peakLoad: input.metrics.peakLoad,
    cumulativeLoad: input.metrics.cumulativeLoad,
    loadRateProxy: input.metrics.loadRateProxy,
    medialLateralBalance: input.metrics.medialLateralBalance,
    heelMidForeToeDistribution: input.metrics.heelMidForeToeDistribution,
    impactLoad: input.metrics.impactLoad,
    fatigueShift: input.metrics.fatigueShift,
    categoryScores: input.metrics.categoryScores,
    profileContext: input.profileContext ?? {}
  };

  return {
    system: [
      "You explain SubStride Lab computed metrics for a runner.",
      "Do not diagnose medical conditions.",
      "Do not invent metrics, hidden measurements, validation status, or sensor accuracy.",
      "Only explain the computed metrics provided in JSON.",
      "Clearly state metric limitations without assigning reliability scores.",
      "Use conservative language.",
      "Do not claim medical-grade accuracy, injury prevention, or that an injury will or will not happen.",
      "Do not recommend medical action except conservative wording for persistent pain or concerning symptoms."
    ].join(" "),
    user: [
      "Explain these deterministic SubStride metrics in plain language.",
      "Keep the explanation concise and separate observations from uncertainty.",
      JSON.stringify(allowedMetrics, null, 2)
    ].join("\n\n")
  };
}

export function assertPromptDoesNotRequestInventedMetrics(prompt: { system: string; user: string }): boolean {
  const combined = `${prompt.system}\n${prompt.user}`.toLowerCase();
  return combined.includes("do not invent metrics") && combined.includes("only explain the computed metrics");
}
