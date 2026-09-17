import { models, providerCatalog } from "@/server/config/models";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    models,
    providers: providerCatalog.map((provider) => ({
      id: provider.id,
      label: provider.label,
      available: Boolean(process.env[provider.apiKeyEnv]),
    })),
    embeddingProvider: process.env.EMBEDDING_PROVIDER ?? "local",
  });
}
