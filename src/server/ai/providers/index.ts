import type { AiProvider, ProviderId } from "@/contracts/ai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenAiProvider } from "./openai";

const providers: Record<ProviderId, AiProvider> = {
  anthropic: new AnthropicProvider(),
  gemini: new GeminiProvider(),
  openai: new OpenAiProvider(),
};

export function getProvider(id: ProviderId) {
  return providers[id];
}

