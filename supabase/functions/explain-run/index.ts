import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const AI_PROMPT_VERSION = "2026-06-ss-v6";
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_DAILY_LIMIT = 20;
const MAX_PAYLOAD_BYTES = 16_000;

const RUN_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "keyTakeaways", "suggestions", "reliabilityNote"],
  properties: {
    summary: {
      type: "string",
      description: "One short plain-language interpretation of the run pattern, not a list of scores.",
    },
    keyTakeaways: {
      type: "array",
      description: "Two to four short takeaways that translate metrics into runner meaning.",
      items: { type: "string" },
    },
    suggestions: {
      type: "array",
      description: "Two to four practical running changes. The first starts with Next run:. The second starts with Form focus:.",
      items: { type: "string" },
    },
    reliabilityNote: {
      type: "string",
      description: "Short caveat when confidence is not high, otherwise an empty string.",
    },
  },
};

const AI_ALLOWED_METRIC_KEYS = new Set([
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
]);

const FORBIDDEN_KEYS = new Set([
  "frames",
  "pressureRaw",
  "relativeLoad",
  "accel",
  "gyro",
  "steps",
  "rawFrames",
  "calibratedFrames",
  "imu",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

interface RequestBody {
  metrics?: unknown;
  clientSessionId?: unknown;
  promptVersion?: unknown;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const userId = userIdFromRequest(req);
    if (!userId) {
      return json({ error: "invalid_user_token" }, 401);
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const metrics = asRecord(body.metrics);
    const clientSessionId = typeof body.clientSessionId === "string" ? body.clientSessionId : undefined;
    const promptVersion = typeof body.promptVersion === "string" ? body.promptVersion : AI_PROMPT_VERSION;

    const validationError = validateMetricsPayload(metrics);
    const requestHash = await sha256(JSON.stringify(metrics ?? {}));
    const runId = await findRunId(ctx.supabaseAdmin, userId, clientSessionId);

    if (validationError) {
      await logAiRequest(ctx.supabaseAdmin, {
        userId,
        runId,
        clientSessionId,
        requestHash,
        promptVersion,
        model: configuredModel(),
        status: "blocked",
        errorCode: validationError,
      });
      return json({ error: validationError }, 400);
    }

    const cached = await findCachedExplanation(ctx.supabaseAdmin, {
      userId,
      requestHash,
      promptVersion,
    });
    if (cached) {
      return json({
        text: cached.text,
        content: cached.content,
        source: "cache",
        model: cached.model,
        promptVersion,
        cached: true,
      });
    }

    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiApiKey) {
      await logAiRequest(ctx.supabaseAdmin, {
        userId,
        runId,
        clientSessionId,
        requestHash,
        promptVersion,
        model: configuredModel(),
        status: "error",
        errorCode: "openai_key_not_configured",
      });
      return json({ error: "openai_key_not_configured" }, 503);
    }

    const quota = await consumeQuota(ctx.supabaseAdmin, userId);
    if (!quota.allowed) {
      await logAiRequest(ctx.supabaseAdmin, {
        userId,
        runId,
        clientSessionId,
        requestHash,
        promptVersion,
        model: configuredModel(),
        status: "rate_limited",
        errorCode: "daily_ai_limit_reached",
      });
      return json({ error: "daily_ai_limit_reached", requestCount: quota.requestCount }, 429);
    }

    const prompt = buildPrompt(metrics);
    const model = configuredModel();
    const requestIdentityHash = await sha256(userId);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        store: false,
        prompt_cache_key: `substride:${requestIdentityHash}`,
        prompt_cache_retention: "24h",
        safety_identifier: requestIdentityHash,
        text: {
          format: {
            type: "json_schema",
            name: "run_summary_and_suggestions",
            strict: true,
            schema: RUN_SUMMARY_SCHEMA,
          },
        },
        reasoning: { effort: "low" },
        max_output_tokens: 800,
      }),
    });

    const responseJson = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorCode = typeof responseJson?.error?.code === "string"
        ? responseJson.error.code
        : `openai_http_${response.status}`;
      const errorMessage = typeof responseJson?.error?.message === "string"
        ? responseJson.error.message
        : "";
      await logAiRequest(ctx.supabaseAdmin, {
        userId,
        runId,
        clientSessionId,
        requestHash,
        promptVersion,
        model,
        status: "error",
        errorCode: errorMessage ? `${errorCode}:${errorMessage.slice(0, 180)}` : errorCode,
      });
      return json({ error: "openai_request_failed", detail: errorCode }, 502);
    }

    const parsedContent = parseSummaryContent(extractResponseText(responseJson));
    if (!parsedContent) {
      await logAiRequest(ctx.supabaseAdmin, {
        userId,
        runId,
        clientSessionId,
        requestHash,
        promptVersion,
        model,
        status: "error",
        errorCode: "invalid_summary_response",
      });
      return json({ error: "invalid_summary_response" }, 502);
    }
    const explanation = formatSummaryContent(parsedContent);

    const usage = responseJson?.usage ?? {};
    await logAiRequest(ctx.supabaseAdmin, {
      userId,
      runId,
      clientSessionId,
      requestHash,
      promptVersion,
      model,
      status: "success",
      explanationText: explanation,
      inputTokens: integerOrNull(usage.input_tokens),
      outputTokens: integerOrNull(usage.output_tokens),
    });

    return json({
      text: explanation,
      content: parsedContent,
      source: "openai",
      model,
      promptVersion,
      requestCount: quota.requestCount,
    });
  }),
};

function validateMetricsPayload(metrics: JsonRecord | undefined): string | undefined {
  if (!metrics) return "missing_metrics_payload";
  const serialized = JSON.stringify(metrics);
  if (serialized.length > MAX_PAYLOAD_BYTES) return "metrics_payload_too_large";

  const disallowedTopLevel = Object.keys(metrics).filter((key) => !AI_ALLOWED_METRIC_KEYS.has(key));
  if (disallowedTopLevel.length > 0) return `disallowed_metric_keys:${disallowedTopLevel.join(",")}`;

  const forbidden = findForbiddenKeys(metrics);
  if (forbidden.length > 0) return `raw_signal_keys_blocked:${forbidden.join(",")}`;

  if (!asRecord(metrics.confidence)) return "missing_confidence";
  if (!asRecord(metrics.totalTrainingLoad)) return "missing_total_training_load";
  if (!asRecord(metrics.mechanicalLoad)) return "missing_mechanical_load";
  if (!asRecord(metrics.categoryScores)) return "missing_category_scores";
  return undefined;
}

function buildPrompt(metrics: JsonRecord): { system: string; user: string } {
  return {
    system: [
      "You explain SubStride Lab's already-computed running metrics for a runner.",
      "You are an interpreter, not a measurement device or clinician.",
      "Only describe the numeric values present in the provided JSON. Do not compute, recompute, or estimate any score.",
      "Do not invent metrics, hidden measurements, sensor accuracy, validation status, or confidence values.",
      "If totalTrainingLoad/trainingStrain is blocked or null, lead with the reliability caveat and do NOT state a load number.",
      "When referring to one run's fused load score, call it Total Session Load, not Total Training Load.",
      "Keep Mechanical Load and Perceived Load separate in the explanation; do not imply missing cardio/GPS/HR data was used.",
      "Always reflect the provided confidence level; if confidence is low or blocked, foreground that uncertainty.",
      "Do not diagnose. Do not name specific injuries or conditions.",
      "Do not use clinical movement terms such as pronation, supination, overpronation, flat foot, or collapse.",
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
      JSON.stringify(metrics, null, 2),
    ].join("\n\n"),
  };
}

function configuredModel(): string {
  return Deno.env.get("OPENAI_MODEL") || DEFAULT_MODEL;
}

function configuredDailyLimit(): number {
  const value = Number(Deno.env.get("AI_DAILY_LIMIT"));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_DAILY_LIMIT;
}

async function consumeQuota(supabaseAdmin: any, userId: string): Promise<{ allowed: boolean; requestCount: number }> {
  const { data, error } = await supabaseAdmin
    .rpc("consume_ai_explanation_quota", {
      p_user_id: userId,
      p_limit: configuredDailyLimit(),
    })
    .single();

  if (error || !data) return { allowed: false, requestCount: configuredDailyLimit() };
  return {
    allowed: data.allowed === true,
    requestCount: Number(data.request_count ?? 0),
  };
}

async function findRunId(
  supabaseAdmin: any,
  userId: string,
  clientSessionId: string | undefined,
): Promise<string | undefined> {
  if (!clientSessionId) return undefined;
  const { data } = await supabaseAdmin
    .from("run_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("client_session_id", clientSessionId)
    .maybeSingle();
  return typeof data?.id === "string" ? data.id : undefined;
}

async function findCachedExplanation(
  supabaseAdmin: any,
  input: {
    userId: string;
    requestHash: string;
    promptVersion: string;
  },
): Promise<{ text: string; content: JsonRecord; model: string } | undefined> {
  const { data } = await supabaseAdmin
    .from("ai_explanation_logs")
    .select("explanation_text, model")
    .eq("user_id", input.userId)
    .eq("request_hash", input.requestHash)
    .eq("prompt_version", input.promptVersion)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const text = typeof data?.explanation_text === "string" ? data.explanation_text : "";
  if (!text) return undefined;
  const content = parseFormattedSummaryContent(text);
  if (!content) return undefined;
  return {
    text,
    content,
    model: typeof data?.model === "string" ? data.model : configuredModel(),
  };
}

async function logAiRequest(
  supabaseAdmin: any,
  input: {
    userId: string;
    runId?: string;
    clientSessionId?: string;
    requestHash: string;
    promptVersion: string;
    model: string;
    status: "success" | "blocked" | "rate_limited" | "error";
    explanationText?: string;
    errorCode?: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
  },
): Promise<void> {
  await supabaseAdmin.from("ai_explanation_logs").insert({
    user_id: input.userId,
    run_id: input.runId ?? null,
    client_session_id: input.clientSessionId ?? null,
    request_hash: input.requestHash,
    prompt_version: input.promptVersion,
    model: input.model,
    status: input.status,
    explanation_text: input.explanationText ?? null,
    error_code: input.errorCode ?? null,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
  });
}

function extractResponseText(responseJson: any): string {
  if (typeof responseJson?.output_text === "string") return responseJson.output_text;
  const chunks: string[] = [];
  for (const item of responseJson?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function parseSummaryContent(text: string): JsonRecord | undefined {
  if (!text.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const content = asRecord(parsed);
  if (!content) return undefined;
  const summary = stringOrEmpty(content.summary);
  const keyTakeaways = stringArray(content.keyTakeaways).slice(0, 4);
  const suggestions = stringArray(content.suggestions).slice(0, 4);
  const reliabilityNote = stringOrEmpty(content.reliabilityNote);
  if (!summary || keyTakeaways.length === 0 || suggestions.length === 0) return undefined;
  return { summary, keyTakeaways, suggestions, reliabilityNote };
}

function formatSummaryContent(content: JsonRecord): string {
  const keyTakeaways = stringArray(content.keyTakeaways);
  const suggestions = stringArray(content.suggestions);
  const lines = [
    "Run summary",
    stringOrEmpty(content.summary),
    "",
    "Key takeaways",
    ...keyTakeaways.map((item) => `- ${item}`),
    "",
    "Suggestions",
    ...suggestions.map((item) => `- ${item}`),
  ];
  const note = stringOrEmpty(content.reliabilityNote);
  if (note) lines.push("", "Note", note);
  return lines.join("\n");
}

function parseFormattedSummaryContent(text: string): JsonRecord | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const runSummaryIndex = lines.findIndex((line) => /^run summary$/i.test(line));
  const takeawaysIndex = lines.findIndex((line) => /^key takeaways$/i.test(line));
  const suggestionsIndex = lines.findIndex((line) => /^suggestions$/i.test(line));
  const noteIndex = lines.findIndex((line) => /^note$/i.test(line));

  if (runSummaryIndex < 0 || takeawaysIndex < 0 || suggestionsIndex < 0) return undefined;
  const summary = lines
    .slice(runSummaryIndex + 1, takeawaysIndex)
    .filter(Boolean)
    .join(" ")
    .trim();
  const keyTakeaways = lines
    .slice(takeawaysIndex + 1, suggestionsIndex)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
    .slice(0, 4);
  const suggestionLines = lines
    .slice(suggestionsIndex + 1, noteIndex > suggestionsIndex ? noteIndex : lines.length)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
    .slice(0, 4);
  const reliabilityNote = noteIndex >= 0
    ? lines.slice(noteIndex + 1).filter(Boolean).join(" ").trim()
    : "";

  if (!summary || keyTakeaways.length === 0 || suggestionLines.length === 0) return undefined;
  return {
    summary,
    keyTakeaways,
    suggestions: suggestionLines,
    reliabilityNote,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function userIdFromRequest(req: Request): string | undefined {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized));
    return typeof decoded.sub === "string" ? decoded.sub : undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function findForbiddenKeys(value: unknown): string[] {
  const hits = new Set<string>();
  walk(value);
  return [...hits];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node as JsonRecord)) {
      if (FORBIDDEN_KEYS.has(key)) hits.add(key);
      walk(child);
    }
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function integerOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function json(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
