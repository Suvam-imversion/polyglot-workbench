import type { ModelConfig, ProviderId } from "@/contracts/ai";

export const models: ModelConfig[] = [
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    supportsTools: true,
    supportsStreaming: true,
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cachedInputUsdPerMillion: 0.2,
  },
  {
    id: "gemini-3.8-flash",
    provider: "gemini",
    label: "Gemini 3.8 Flash",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    supportsTools: true,
    supportsStreaming: true,
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 3.75,
    cachedInputUsdPerMillion: 0.075,
  },
  {
    id: "gpt-5.6-sol",
    provider: "openai",
    label: "GPT-5.6 Sol",
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    supportsTools: true,
    supportsStreaming: true,
    inputUsdPerMillion: 4,
    outputUsdPerMillion: 20,
    cachedInputUsdPerMillion: 0.4,
  },
];

export const fallbackChain: Record<ProviderId, ProviderId[]> = {
  anthropic: ["gemini", "openai"],
  gemini: ["anthropic", "openai"],
  openai: ["anthropic", "gemini"],
};

export function getModel(provider: ProviderId, modelId?: string) {
  const match = models.find((model) => model.provider === provider && model.id === modelId);
  return match ?? models.find((model) => model.provider === provider)!;
}

