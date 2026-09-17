import { models } from "@/server/config/models";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    models,
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
    },
    embeddingProvider: process.env.EMBEDDING_PROVIDER ?? "local",
  });
}

