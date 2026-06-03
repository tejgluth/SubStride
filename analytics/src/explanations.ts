import type { ConfidenceLevel, MetricValue, RunMetrics } from "./types";
import { scoreCategory } from "./metrics";

export function deterministicExplanation(metrics: RunMetrics): string {
  const loadScore = metrics.totalTrainingLoad?.value.score0To100 ?? metrics.trainingStrain.value;
  const strainCategory = scoreCategory(loadScore);
  const confidence = metrics.confidence;
  const perceived = metrics.perceivedLoad?.value;
  const lines = [];
  if (confidence && !confidence.scoreShowable) {
    lines.push(
      `Total Training Load is not reliable for this run (${confidence.blocking.join(", ") || "low confidence"}); the number is hidden until data quality improves.`
    );
  } else {
    lines.push(`Total Training Load is ${loadScore}/100 (${strainCategory}).`);
    if (confidence && confidence.level !== "high") {
      lines.push(`Confidence is ${confidence.level}${confidence.reasonCodes.length ? ` (${confidence.reasonCodes.join(", ")})` : ""}.`);
    }
  }
  lines.push(
    `Mechanical Load is ${metrics.mechanicalLoad?.value.score0To100 ?? metrics.trainingStrain.value}/100 from pressure and IMU signals.`
  );
  if (perceived?.score0To100 != null && perceived.rawRpeMinutes != null) {
    lines.push(`Perceived Load is ${perceived.score0To100}/100 from ${perceived.rawRpeMinutes.toFixed(0)} RPE-minutes.`);
  } else {
    lines.push("Perceived Load was not supplied, so the total is a mechanical-only estimate.");
  }
  lines.push("These are beta load and gait indicators, not a diagnosis, injury probability, or medical-grade injury prediction.");
  return lines.join(" ");
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

/** Stable version so AI prompt changes are auditable / cacheable. */
export const AI_PROMPT_VERSION = "2026-06-ss-v2";

/**
 * The ONLY metric keys the AI is ever allowed to see. Anything not in this list (raw frames,
 * pressure arrays, IMU samples, internal step data) is intentionally excluded so the model cannot
 * "discover" hidden measurements or invent precision. Tests assert the payload matches this set.
 */
export const AI_ALLOWED_METRIC_KEYS = [
  "sessionId",
  "foot",
  "confidence",
  "totalTrainingLoad",
  "mechanicalLoad",
  "perceivedLoad",
  "trainingStrain",
  "cadence",
  "contactTime",
  "totalRelativeLoad",
  "peakLoad",
  "cumulativeLoad",
  "loadRateProxy",
  "medialLateralBalance",
  "heelMidForeToeDistribution",
  "impactLoad",
  "fatigueShift",
  "asymmetry",
  "categoryScores",
  "profileContext",
] as const;

function publicMetric<T>(metric: MetricValue<T>): Record<string, unknown> {
  return {
    value: metric.value,
    units: metric.units,
    confidence: metric.confidence,
    experimental: metric.experimental ?? false,
    limitations: metric.limitations ?? [],
  };
}

/**
 * Build the exact JSON object the AI is allowed to summarize. Pure projection of already-computed
 * deterministic values — never raw signals, never anything the AI could mistake for new data.
 */
export function buildAiPayload(input: AiPromptInput): Record<string, unknown> {
  const m = input.metrics;
  const payload: Record<string, unknown> = {
    sessionId: m.sessionId,
    foot: m.foot,
    confidence: m.confidence
      ? { level: m.confidence.level, reasonCodes: m.confidence.reasonCodes, scoreShowable: m.confidence.scoreShowable }
      : undefined,
    totalTrainingLoad: m.confidence?.scoreShowable === false ? { value: null, units: "0-100", blocked: true } : publicMetric(m.totalTrainingLoad),
    mechanicalLoad: publicMetric(m.mechanicalLoad),
    perceivedLoad: publicMetric(m.perceivedLoad),
    trainingStrain: m.confidence?.scoreShowable === false ? { value: null, units: "0-100", blocked: true } : publicMetric(m.trainingStrain),
    cadence: publicMetric(m.cadence),
    contactTime: publicMetric(m.contactTime),
    totalRelativeLoad: publicMetric(m.totalRelativeLoad),
    peakLoad: publicMetric(m.peakLoad),
    cumulativeLoad: publicMetric(m.cumulativeLoad),
    loadRateProxy: publicMetric(m.loadRateProxy),
    medialLateralBalance: publicMetric(m.medialLateralBalance),
    heelMidForeToeDistribution: { value: m.heelMidForeToeDistribution.value, units: m.heelMidForeToeDistribution.units },
    impactLoad: publicMetric(m.impactLoad),
    fatigueShift: publicMetric(m.fatigueShift),
    asymmetry: m.asymmetry ? publicMetric(m.asymmetry) : undefined,
    categoryScores: Object.fromEntries(
      Object.entries(m.categoryScores).map(([key, metric]) => [key, { value: metric.value, experimental: metric.experimental ?? false }])
    ),
    profileContext: input.profileContext ?? {},
  };
  // Drop undefined keys so the payload only contains whitelisted, present fields.
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }
  return payload;
}

export function buildOpenAiExplanationPrompt(input: AiPromptInput): { system: string; user: string; promptVersion: string } {
  const allowedMetrics = buildAiPayload(input);

  return {
    promptVersion: AI_PROMPT_VERSION,
    system: [
      "You explain SubStride Lab's already-computed running metrics for a runner.",
      "You are an interpreter, not a measurement device or clinician.",
      "Only describe the numeric values present in the provided JSON. Do not compute, recompute, or estimate any score (Total Training Load, Training Strain alias, and all category scores are computed elsewhere).",
      "Do not invent metrics, hidden measurements, sensor accuracy, validation status, or confidence values.",
      "If totalTrainingLoad/trainingStrain is blocked or null, lead with the reliability caveat and do NOT state a load number.",
      "Keep Mechanical Load and Perceived Load separate in the explanation; do not imply missing cardio/GPS/HR data was used.",
      "Always reflect the provided confidence level; if confidence is low or blocked, foreground that uncertainty.",
      "Do not diagnose. Do not name specific injuries or conditions.",
      "Do not use clinical movement terms such as 'pronation', 'supination', 'overpronation', 'flat foot', or 'collapse' — describe medial/lateral load distribution in plain relative terms instead.",
      "Do not claim medical-grade accuracy, injury prevention, or that an injury will or will not happen.",
      "Treat any metric marked experimental as a rough proxy and say so.",
      "Use conservative language; recommend seeing a professional only for persistent pain or concerning symptoms.",
    ].join(" "),
    user: [
      "Explain these deterministic SubStride metrics in plain language.",
      "Keep it concise and clearly separate observations from uncertainty.",
      JSON.stringify(allowedMetrics, null, 2)
    ].join("\n\n")
  };
}

/**
 * UI gate: only show AI text when the required computed metrics are structurally present and
 * finite. (A blocked/low-confidence score is still allowed — the AI explains the caveat — but a
 * missing or NaN score must never be narrated.)
 */
export function canShowAiExplanation(metrics: RunMetrics | undefined): boolean {
  if (!metrics) return false;
  if (!metrics.confidence) return false;
  if (!metrics.totalTrainingLoad || typeof metrics.totalTrainingLoad.value.score0To100 !== "number" || !Number.isFinite(metrics.totalTrainingLoad.value.score0To100)) return false;
  if (!metrics.trainingStrain || typeof metrics.trainingStrain.value !== "number" || !Number.isFinite(metrics.trainingStrain.value)) return false;
  if (!metrics.categoryScores) return false;
  return true;
}

export function assertPromptDoesNotRequestInventedMetrics(prompt: { system: string; user: string }): boolean {
  const combined = `${prompt.system}\n${prompt.user}`.toLowerCase();
  return combined.includes("do not invent metrics") && combined.includes("only describe the numeric values");
}

/**
 * Verify an AI payload contains only whitelisted keys and no raw signal data. Returns the list of
 * disallowed keys found (empty = safe). Used in tests and can guard a real API call.
 */
export function findDisallowedAiPayloadKeys(payload: Record<string, unknown>): string[] {
  const allowed = new Set<string>(AI_ALLOWED_METRIC_KEYS);
  const forbidden = ["frames", "pressureRaw", "relativeLoad", "accel", "gyro", "steps", "rawFrames"];
  const disallowed = Object.keys(payload).filter((key) => !allowed.has(key));
  for (const key of forbidden) {
    if (key in payload) disallowed.push(key);
  }
  return [...new Set(disallowed)];
}
