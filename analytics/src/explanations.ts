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
      `Total Session Load is not reliable for this run (${confidence.blocking.join(", ") || "low confidence"}); the number is hidden until data quality improves.`
    );
  } else {
    lines.push(`Total Session Load is ${loadScore}/100 (${strainCategory}).`);
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

export interface RunSummaryAndSuggestionsContent {
  summary: string;
  keyTakeaways: string[];
  suggestions: string[];
  reliabilityNote?: string;
}

export function formatRunSummaryAndSuggestions(content: RunSummaryAndSuggestionsContent): string {
  const lines = [
    "Run summary",
    content.summary,
    "",
    "Key takeaways",
    ...content.keyTakeaways.map((item) => `- ${item}`),
    "",
    "Suggestions",
    ...content.suggestions.map((item) => `- ${item}`),
  ];
  if (content.reliabilityNote) {
    lines.push("", "Note", content.reliabilityNote);
  }
  return lines.join("\n");
}

export function deterministicRunSummaryAndSuggestionsContent(input: AiPromptInput | RunMetrics): RunSummaryAndSuggestionsContent {
  const metrics = "metrics" in input ? input.metrics : input;
  const profileContext = "metrics" in input ? input.profileContext : undefined;
  const total = metrics.totalTrainingLoad?.value;
  const totalScore = total?.score0To100 ?? metrics.trainingStrain.value;
  const category = scoreCategory(totalScore);
  const confidence = metrics.confidence;
  const perceived = metrics.perceivedLoad?.value;
  const mechanical = metrics.mechanicalLoad?.value;
  const fatigueShift = metrics.fatigueShift?.value ?? 0;
  const balanceScore = metrics.categoryScores?.loadBalance?.value ?? 100;
  const impactScore = metrics.categoryScores?.impactLoad?.value ?? 0;
  const forefootScore = metrics.categoryScores?.forefootMetatarsalLoad?.value ?? 0;
  const pressure = metrics.pressureRegionPercentages?.value;
  const runName = cleanRunName(profileContext?.runName ?? profileContext?.workoutType);

  if (confidence && !confidence.scoreShowable) {
    return {
      summary: `${runName}: this run is not clean enough to summarize confidently yet.`,
      keyTakeaways: [
        "The score is hidden because the sensor data quality was too low.",
        "This session should not be compared against your baseline.",
      ],
      suggestions: [
        "Next run: do a short easy run on a flat, familiar route so you can keep the effort controlled.",
        "Form focus: keep your stride relaxed and even, avoiding sharp turns or sudden speed changes until the data quality is cleaner.",
      ],
      reliabilityNote: `Score withheld: ${confidence.blocking.join(", ") || "low confidence"}.`,
    };
  }

  const keyTakeaways: string[] = [];
  let summary = `${runName}: `;
  if (mechanical) {
    if (category === "high" || category === "very_high") {
      summary += "this looked like a demanding run, so the next session should prioritize control, recovery, and smooth mechanics.";
      keyTakeaways.push("Your feet took a higher training stimulus than an easy baseline run.");
    } else if (category === "low") {
      summary += "this looked like a light effort, which is useful for recovery and practicing relaxed mechanics.";
      keyTakeaways.push("This was a lower-load session for your current SubStride baseline.");
    } else {
      summary += "this looked manageable, with no single load signal dominating the session.";
      keyTakeaways.push("This looks like a moderate session rather than a major spike.");
    }

    if (perceived?.score0To100 == null) {
      keyTakeaways.push("Your entered effort is missing, so the load estimate is based on mechanical foot data only.");
    } else if (perceived.score0To100 > mechanical.score0To100 + 15) {
      keyTakeaways.push("The run felt harder than the foot-load pattern alone suggests.");
    } else if (mechanical.score0To100 > perceived.score0To100 + 15) {
      keyTakeaways.push("Your foot-load pattern was higher than your effort rating suggests.");
    } else {
      keyTakeaways.push("Your foot-load pattern and entered effort are reasonably aligned.");
    }
  }

  if (Math.abs(fatigueShift) >= 8) {
    keyTakeaways.push("Your pressure pattern changed noticeably late in the run, which can happen when fatigue starts changing how you load the foot.");
  } else {
    keyTakeaways.push("Your late-run pressure pattern stayed fairly consistent.");
  }
  if (pressure) {
    const longitudinal = dominantRegion([
      ["heel", pressure.heel],
      ["midfoot", pressure.midfoot],
      ["forefoot", pressure.forefoot],
      ["toe", pressure.toe],
    ]);
    const side = dominantRegion([
      ["medial", pressure.medial],
      ["center", pressure.center],
      ["lateral", pressure.lateral],
    ]);
    keyTakeaways.push(`Region pressure was led by ${longitudinal.label} (${longitudinal.value.toFixed(1)}%) and ${side.label} side loading (${side.value.toFixed(1)}%).`);
  }
  if (balanceScore < 70) {
    keyTakeaways.push("There was a meaningful inner/outer load bias to monitor across repeat runs.");
  }
  if (impactScore >= 65) {
    keyTakeaways.push("The impact pattern was sharper than ideal for an easy session.");
  }
  if (forefootScore >= 70) {
    keyTakeaways.push("A larger share of load sat toward the forefoot and metatarsal zones.");
  }

  const nextRunSuggestion = nextRunAction(totalScore, category, profileContext?.painScore0To10);
  const formSuggestion = formFocusAction({ fatigueShift, balanceScore, impactScore, forefootScore, pressure });
  const secondarySuggestions = secondaryRunningActions({
    category,
    perceivedMissing: perceived?.score0To100 == null,
    painScore0To10: profileContext?.painScore0To10,
    fatigueShift,
    balanceScore,
    impactScore,
    forefootScore,
  });
  const suggestions = [nextRunSuggestion, formSuggestion, ...secondarySuggestions];

  return {
    summary,
    keyTakeaways: keyTakeaways.slice(0, 4),
    suggestions: suggestions.slice(0, 4),
    reliabilityNote: confidence?.level && confidence.level !== "high"
      ? `Confidence is ${confidence.level}; treat this as directional until cleaner data or more baseline runs are available.`
      : undefined,
  };
}

export function deterministicRunSummaryAndSuggestions(input: AiPromptInput | RunMetrics): string {
  return formatRunSummaryAndSuggestions(deterministicRunSummaryAndSuggestionsContent(input));
}

function nextRunAction(totalScore: number, category: ReturnType<typeof scoreCategory>, painScore0To10: number | undefined): string {
  if (typeof painScore0To10 === "number" && painScore0To10 >= 4) {
    return "Next run: take a recovery day or do a very short easy run; stop if pain increases while running.";
  }
  if (category === "high" || category === "very_high" || totalScore >= 75) {
    return "Next run: make it an easy recovery run, cut the distance, skip speed work, and keep the effort conversational.";
  }
  if (totalScore <= 35) {
    return "Next run: keep it easy; if you feel fresh, add only 5-10 minutes rather than adding speed, hills, or harder effort.";
  }
  return "Next run: stay with a steady easy-to-moderate run before adding intensity, especially if this was part of a bigger training week.";
}

function formFocusAction(input: { fatigueShift: number; balanceScore: number; impactScore: number; forefootScore: number; pressure?: Record<string, number> }): string {
  const pattern = strongestFormPattern(input);
  if (pattern === "impact") {
    return "Form focus: because the impact pattern was sharper, shorten the stride slightly, land under your hips, and keep cadence quick but relaxed.";
  }
  if (pattern === "heel") {
    return `Form focus: heel pressure led this run at ${formatPercent(input.pressure?.heel)}, so soften the landing by increasing cadence slightly and landing closer under your hips rather than reaching forward.`;
  }
  if (pattern === "fatigue") {
    return `Form focus: your pressure pattern shifted late by ${Math.abs(input.fatigueShift).toFixed(1)} points, so keep posture tall and shorten your stride before fatigue changes your foot loading.`;
  }
  if (pattern === "imbalance") {
    return `Form focus: side loading was uneven${sideLoadText(input.pressure)}, so keep your hips level and aim for quiet, even foot strikes instead of leaning into one side.`;
  }
  if (pattern === "forefoot") {
    return `Form focus: forefoot and toe pressure were high at ${formatPercent((input.pressure?.forefoot ?? 0) + (input.pressure?.toe ?? 0))}, so avoid aggressive toe push-off and let the heel-to-toe roll happen naturally.`;
  }
  return "Form focus: keep shoulders relaxed, arms compact, and foot strikes quiet while maintaining smooth turnover.";
}

function strongestFormPattern(input: { fatigueShift: number; balanceScore: number; impactScore: number; forefootScore: number; pressure?: Record<string, number> }): "impact" | "heel" | "fatigue" | "imbalance" | "forefoot" | "general" {
  const candidates = [
    { pattern: "impact" as const, severity: input.impactScore >= 65 ? input.impactScore - 60 : 0 },
    { pattern: "heel" as const, severity: (input.pressure?.heel ?? 0) >= 40 ? (input.pressure?.heel ?? 0) - 34 : 0 },
    { pattern: "fatigue" as const, severity: Math.abs(input.fatigueShift) >= 8 ? Math.abs(input.fatigueShift) * 2 : 0 },
    { pattern: "imbalance" as const, severity: input.balanceScore < 70 ? 70 - input.balanceScore : 0 },
    { pattern: "forefoot" as const, severity: input.forefootScore >= 70 ? input.forefootScore - 60 : 0 },
  ].sort((a, b) => b.severity - a.severity);
  return candidates[0]?.severity > 0 ? candidates[0].pattern : "general";
}

function secondaryRunningActions(input: {
  category: ReturnType<typeof scoreCategory>;
  perceivedMissing: boolean;
  painScore0To10: number | undefined;
  fatigueShift: number;
  balanceScore: number;
  impactScore: number;
  forefootScore: number;
}): string[] {
  const actions: string[] = [];
  if (input.impactScore >= 65) {
    actions.push("Route choice: choose a softer or flatter surface next time to reduce pounding while you test the same pace.");
  }
  if (input.forefootScore >= 70) {
    actions.push("Training choice: hold off on hills, sprints, and long downhill sections until forefoot load settles.");
  }
  if (input.balanceScore < 70) {
    actions.push("Drill focus: add a few relaxed strides on flat ground, paying attention to even left-right rhythm.");
  }
  if (Math.abs(input.fatigueShift) >= 8) {
    actions.push("Pacing choice: slow the final segment sooner so your form stays consistent late in the run.");
  }
  if (input.perceivedMissing || actions.length === 0) {
    actions.push("Effort target: keep the next run at a pace where you can speak in short sentences.");
  }
  if (typeof input.painScore0To10 === "number" && input.painScore0To10 >= 4) {
    actions.push("Recovery choice: replace speed work with walking, mobility, or rest until the pain is clearly settling.");
  }
  if (actions.length < 2 && input.category !== "high" && input.category !== "very_high") {
    actions.push("Progression: finish the next run feeling like you could comfortably keep going.");
  }
  return actions.slice(0, 2);
}

function dominantRegion(entries: Array<[string, number]>): { label: string; value: number } {
  const [label, value] = entries.reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    entries[0] ?? ["unknown", 0]
  );
  return { label, value };
}

function formatPercent(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "the highest share";
}

function sideLoadText(pressure: Record<string, number> | undefined): string {
  if (!pressure) return "";
  const side = dominantRegion([
    ["medial", pressure.medial ?? 0],
    ["center", pressure.center ?? 0],
    ["lateral", pressure.lateral ?? 0],
  ]);
  return `, led by ${side.label} at ${formatPercent(side.value)}`;
}

function cleanRunName(value: string | undefined): string {
  const cleaned = (value ?? "Run")
    .replace(/SubStride\s+Simulator/gi, "")
    .replace(/\bSimulator\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Run";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export interface AiPromptInput {
  metrics: RunMetrics;
  profileContext?: {
    runName?: string;
    shoe?: string;
    surface?: string;
    workoutType?: string;
    painScore0To10?: number;
  };
}

/** Stable version so AI prompt changes are auditable / cacheable. */
export const AI_PROMPT_VERSION = "2026-06-ss-v6";

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
  "pressureRegionPercentages",
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
    pressureRegionPercentages: m.pressureRegionPercentages ? publicMetric(m.pressureRegionPercentages) : undefined,
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
      "Only describe the numeric values present in the provided JSON. Do not compute, recompute, or estimate any score (Total Session Load, Training Strain alias, and all category scores are computed elsewhere).",
      "Do not invent metrics, hidden measurements, sensor accuracy, validation status, or confidence values.",
      "If totalTrainingLoad/trainingStrain is blocked or null, lead with the reliability caveat and do NOT state a load number.",
      "Keep Mechanical Load and Perceived Load separate in the explanation; do not imply missing cardio/GPS/HR data was used.",
      "Always reflect the provided confidence level; if confidence is low or blocked, foreground that uncertainty.",
      "Do not diagnose. Do not name specific injuries or conditions.",
      "Do not use clinical movement terms such as 'pronation', 'supination', 'overpronation', 'flat foot', or 'collapse' — describe medial/lateral load distribution in plain relative terms instead.",
      "Do not claim medical-grade accuracy, injury prevention, or that an injury will or will not happen.",
      "Treat any metric marked experimental as a rough proxy and say so.",
      "Use conservative language; recommend seeing a professional only for persistent pain or concerning symptoms.",
      "Do not simply restate the metrics list. Translate the numbers into what the runner should understand.",
      "Mention at most one raw score if needed; the UI already shows the numbers.",
      "Return one plain-language summary, 2-4 key takeaways, and 3-4 practical load-management suggestions.",
      "Suggestions must be actual running actions, not app instructions or data-review instructions.",
      "The first suggestion must start with 'Next run:' and recommend what type of run to do next based on load and pain context.",
      "The second suggestion must start with 'Form focus:' and recommend a physical running-form adjustment based on the strongest pressure/loading pattern.",
      "Every suggestion should connect to a provided pattern, such as heel share, forefoot/toe share, medial/lateral bias, fatigue shift, impact proxy, load score, perceived load, or pain context.",
      "Good suggestions include pacing changes, making the next run easier or shorter, avoiding hills or speed work, using a flat or softer route, keeping posture tall, shortening stride slightly when fatigued, landing under the body, relaxing shoulders, and backing off if pain increases.",
      "Use pressureRegionPercentages when available. It contains heel/midfoot/forefoot/toe percentages and medial/center/lateral percentages; each grouping sums separately to 100.",
      "If heel percentage is high, the form cue can recommend softening heel strike by increasing cadence slightly, landing under the hips, and moving toward a softer midfoot/forefoot contact without forcing a toe landing.",
      "If late-run fatigue shift or forefoot drift is high, the form cue can recommend keeping steps centered through the forefoot, posture tall, and stride slightly shorter late in the run.",
      "If forefoot/toe percentage is high, avoid telling the runner to add more forefoot pressure; recommend reducing aggressive toe push-off, avoiding hills/speed work, and keeping contact soft.",
      "Do not tell the runner to save the run, use a screen, enter data, compare dashboards, or use the app differently.",
      "Do not mention AI, APIs, backend routing, prompts, JSON, Supabase, OpenAI, or implementation details.",
    ].join(" "),
    user: [
      "Create a run summary and suggestions from these deterministic SubStride metrics in plain language.",
      "Keep it concise and clearly separate observations, uncertainty, and suggestions.",
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
