import { buildOpenAiExplanationPrompt, deterministicExplanation, type RunMetrics } from "@substride/analytics";

export async function explainRun(metrics: RunMetrics, apiKey?: string): Promise<{ text: string; source: "deterministic_stub" | "openai_ready" }> {
  const prompt = buildOpenAiExplanationPrompt({ metrics });
  if (!apiKey) {
    return {
      text: `${deterministicExplanation(metrics)} AI explanation is disabled until an OpenAI API key is configured.`,
      source: "deterministic_stub"
    };
  }
  // The prompt is built here so adding a backend proxy or secure key flow later does not change analytics code.
  return {
    text: `OpenAI-ready prompt built with ${prompt.user.length} user-prompt characters. Route this through a secure backend before production.`,
    source: "openai_ready"
  };
}
