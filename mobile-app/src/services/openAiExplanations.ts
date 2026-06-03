import {
  buildAiPayload,
  buildOpenAiExplanationPrompt,
  canShowAiExplanation,
  deterministicExplanation,
  findDisallowedAiPayloadKeys,
  type RunMetrics,
} from "@substride/analytics";

export async function explainRun(
  metrics: RunMetrics,
  apiKey?: string
): Promise<{ text: string; source: "deterministic_stub" | "openai_ready" | "unavailable" }> {
  // Guardrail: never narrate metrics that are not structurally present.
  if (!canShowAiExplanation(metrics)) {
    return {
      text: "Not enough valid computed data to generate an explanation for this run.",
      source: "unavailable",
    };
  }

  const prompt = buildOpenAiExplanationPrompt({ metrics });
  // Defense in depth: refuse to send anything that smuggles raw signal data or unexpected keys.
  const disallowed = findDisallowedAiPayloadKeys(buildAiPayload({ metrics }));
  if (disallowed.length > 0) {
    return {
      text: `${deterministicExplanation(metrics)} AI summary withheld: payload contained disallowed fields (${disallowed.join(", ")}).`,
      source: "unavailable",
    };
  }

  if (!apiKey) {
    return {
      text: `${deterministicExplanation(metrics)} AI explanation is disabled until an OpenAI API key is configured.`,
      source: "deterministic_stub",
    };
  }
  // The prompt is built here so adding a backend proxy or secure key flow later does not change analytics code.
  return {
    text: `OpenAI-ready prompt built with ${prompt.user.length} user-prompt characters. Route this through a secure backend before production.`,
    source: "openai_ready",
  };
}
