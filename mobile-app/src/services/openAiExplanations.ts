import {
  AI_PROMPT_VERSION,
  buildAiPayload,
  buildOpenAiExplanationPrompt,
  canShowAiExplanation,
  deterministicRunSummaryAndSuggestionsContent,
  formatRunSummaryAndSuggestions,
  findDisallowedAiPayloadKeys,
  type RunSummaryAndSuggestionsContent,
  type RunMetrics,
} from "@substride/analytics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabaseClient";

export interface RunExplanationResult {
  text: string;
  content: RunSummaryAndSuggestionsContent;
  source: "local" | "cloud" | "unavailable";
  errorCode?: string;
}

const CLOUD_SUMMARY_TIMEOUT_MS = 12_000;
const SUMMARY_CACHE_PREFIX = "substride.aiSummary.";

export function buildLocalRunExplanation(
  metrics: RunMetrics,
  options: {
    profileContext?: {
      runName?: string;
      shoe?: string;
      surface?: string;
      workoutType?: string;
      painScore0To10?: number;
    };
  } = {}
): RunExplanationResult {
  if (!canShowAiExplanation(metrics)) {
    const content = {
      summary: "Run summary and suggestions are unavailable until this run has enough valid data.",
      keyTakeaways: [],
      suggestions: [],
    };
    return {
      text: content.summary,
      content,
      source: "unavailable",
      errorCode: "invalid_metrics",
    };
  }

  const promptInput = { metrics, profileContext: options.profileContext };
  const content = deterministicRunSummaryAndSuggestionsContent(promptInput);
  return {
    text: formatRunSummaryAndSuggestions(content),
    content,
    source: "local",
  };
}

export async function explainRun(
  metrics: RunMetrics,
  options: {
    cacheKey?: string;
    profileContext?: {
      runName?: string;
      shoe?: string;
      surface?: string;
      workoutType?: string;
      painScore0To10?: number;
    };
  } = {}
): Promise<RunExplanationResult> {
  // Guardrail: never narrate metrics that are not structurally present.
  const localResult = buildLocalRunExplanation(metrics, options);
  if (localResult.source === "unavailable") return localResult;
  const promptInput = { metrics, profileContext: options.profileContext };
  buildOpenAiExplanationPrompt(promptInput);
  const payload = buildAiPayload(promptInput);
  // Defense in depth: refuse to send anything that smuggles raw signal data or unexpected keys.
  const disallowed = findDisallowedAiPayloadKeys(payload);
  if (disallowed.length > 0) {
    return {
      text: localResult.text,
      content: localResult.content,
      source: "local",
      errorCode: `disallowed_payload:${disallowed.join(",")}`,
    };
  }

  if (options.cacheKey) {
    const cached = await readCachedRunExplanation(options.cacheKey);
    if (cached) return cached;
  }

  if (!supabase) {
    return {
      text: localResult.text,
      content: localResult.content,
      source: "local",
      errorCode: "cloud_not_configured",
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return {
      text: localResult.text,
      content: localResult.content,
      source: "local",
      errorCode: "not_signed_in",
    };
  }

  let response: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    response = await withTimeout(
      supabase.functions.invoke("explain-run", {
        body: {
          metrics: payload,
          clientSessionId: metrics.sessionId,
          promptVersion: AI_PROMPT_VERSION,
        },
      }),
      CLOUD_SUMMARY_TIMEOUT_MS
    );
  } catch (error) {
    return {
      text: localResult.text,
      content: localResult.content,
      source: "local",
      errorCode: error instanceof Error ? error.message : "cloud_summary_unavailable",
    };
  }
  const { data, error } = response as {
    data?: { text?: unknown; content?: unknown };
    error?: { message?: string } | null;
  };

  if (error || typeof data?.text !== "string") {
    return {
      text: localResult.text,
      content: localResult.content,
      source: "local",
      errorCode: error?.message ?? "cloud_summary_unavailable",
    };
  }

  const cloudContent = normalizeSummaryContent(data.content);
  if (!cloudContent) {
    return {
      text: localResult.text,
      content: localResult.content,
      source: "local",
      errorCode: "cloud_summary_malformed",
    };
  }

  const result: RunExplanationResult = {
    text: formatRunSummaryAndSuggestions(cloudContent),
    content: cloudContent,
    source: "cloud",
  };
  await writeCachedRunExplanation(options.cacheKey, result);
  return result;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("cloud_summary_timeout"));
    }, timeoutMs);
    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timeout));
  });
}

async function readCachedRunExplanation(cacheKey: string): Promise<RunExplanationResult | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheStorageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunExplanationResult> & { cachedAt?: string };
    const content = normalizeSummaryContent(parsed.content);
    if (!content || parsed.source !== "cloud") return null;
    return {
      text: formatRunSummaryAndSuggestions(content),
      content,
      source: "cloud",
    };
  } catch {
    return null;
  }
}

async function writeCachedRunExplanation(cacheKey: string | undefined, result: RunExplanationResult): Promise<void> {
  if (!cacheKey || result.source !== "cloud") return;
  try {
    await AsyncStorage.setItem(cacheStorageKey(cacheKey), JSON.stringify({
      cachedAt: new Date().toISOString(),
      content: result.content,
      source: result.source,
    }));
  } catch {
    // Summary caching is a cost optimization, not a correctness dependency.
  }
}

function cacheStorageKey(cacheKey: string): string {
  return `${SUMMARY_CACHE_PREFIX}${hashString(cacheKey)}`;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function normalizeSummaryContent(value: unknown): RunSummaryAndSuggestionsContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const keyTakeaways = toStringList(record.keyTakeaways).slice(0, 4);
  const suggestions = toStringList(record.suggestions).slice(0, 4);
  const reliabilityNote = typeof record.reliabilityNote === "string" ? record.reliabilityNote.trim() : undefined;

  if (!summary || keyTakeaways.length === 0 || suggestions.length === 0) return null;
  if (containsTechnicalLeak(summary) || keyTakeaways.some(containsTechnicalLeak) || suggestions.some(containsTechnicalLeak)) return null;
  return {
    summary,
    keyTakeaways,
    suggestions,
    reliabilityNote: reliabilityNote || undefined,
  };
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function containsTechnicalLeak(text: string): boolean {
  return /\b(openai|supabase|api|json|prompt|backend|edge function)\b/i.test(text);
}
