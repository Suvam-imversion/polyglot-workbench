import { OpenAiCompatibleProvider } from "@/server/ai/providers/openai";

export class GroqProvider extends OpenAiCompatibleProvider {
  constructor() {
    super({
      id: "groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKeyEnv: "GROQ_API_KEY",
    });
  }
}
