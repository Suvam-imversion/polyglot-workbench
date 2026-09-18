import type { AiProvider, ModelConfig, ProviderId } from "@/contracts/ai";

type ConfiguredModel = Omit<ModelConfig, "provider">;

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  apiKeyEnv: string;
  fallbacks: ProviderId[];
  loadAdapter: () => Promise<AiProvider>;
  models: ConfiguredModel[];
};

// Adding a provider means adding its adapter file and one entry here. All validation,
// registry loading, UI labels, model lists, key status, and fallbacks derive from this catalog.
export const providerCatalog: ProviderConfig[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    fallbacks: ["gemini", "groq", "openai"],
    loadAdapter: () => import("@/server/ai/providers/anthropic").then(({ AnthropicProvider }) => new AnthropicProvider()),
    models: [{
      id: "claude-sonnet-5",
      label: "Claude Sonnet 5",
      contextWindow: 1_000_000,
      maxOutputTokens: 128_000,
      supportsTools: true,
      supportsVision: true,
      supportsJsonSchema: true,
      supportsStreaming: true,
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 10,
      cachedInputUsdPerMillion: 0.2,
    }],
  },
  {
    id: "gemini",
    label: "Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    fallbacks: ["groq", "anthropic", "openai"],
    loadAdapter: () => import("@/server/ai/providers/gemini").then(({ GeminiProvider }) => new GeminiProvider()),
    models: [{
      id: "gemini-3.6-flash",
      label: "Gemini 3.6 Flash",
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
      supportsTools: true,
      supportsVision: true,
      supportsJsonSchema: true,
      supportsStreaming: true,
      inputUsdPerMillion: 0.75,
      outputUsdPerMillion: 3.75,
      cachedInputUsdPerMillion: 0.075,
    }],
  },
  {
    id: "groq",
    label: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    fallbacks: ["gemini", "anthropic", "openai"],
    loadAdapter: () => import("@/server/ai/providers/groq").then(({ GroqProvider }) => new GroqProvider()),
    models: [{
      id: "openai/gpt-oss-20b",
      label: "GPT-OSS 20B",
      contextWindow: 131_072,
      maxOutputTokens: 65_536,
      supportsTools: true,
      supportsVision: false,
      supportsJsonSchema: true,
      supportsStreaming: true,
      inputUsdPerMillion: 0.075,
      outputUsdPerMillion: 0.3,
    }],
  },
  {
    id: "openai",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    fallbacks: ["gemini", "groq", "anthropic"],
    loadAdapter: () => import("@/server/ai/providers/openai").then(({ OpenAiProvider }) => new OpenAiProvider()),
    models: [{
      id: "gpt-5.6-sol",
      label: "GPT-5.6 Sol",
      contextWindow: 1_050_000,
      maxOutputTokens: 128_000,
      supportsTools: true,
      supportsVision: true,
      supportsJsonSchema: true,
      supportsStreaming: true,
      inputUsdPerMillion: 4,
      outputUsdPerMillion: 20,
      cachedInputUsdPerMillion: 0.4,
    }],
  },
];

export const models: ModelConfig[] = providerCatalog.flatMap((provider) =>
  provider.models.map((model) => ({ ...model, provider: provider.id })),
);

export const fallbackChain = Object.fromEntries(
  providerCatalog.map((provider) => [provider.id, provider.fallbacks]),
) as Record<ProviderId, ProviderId[]>;

export function getProviderConfig(id: ProviderId) {
  return providerCatalog.find((provider) => provider.id === id);
}

export function getModel(provider: ProviderId, modelId?: string) {
  const providerModels = models.filter((model) => model.provider === provider);
  const match = providerModels.find((model) => model.id === modelId) ?? providerModels[0];
  if (!match) throw new Error(`Unknown provider: ${provider}`);
  return match;
}
