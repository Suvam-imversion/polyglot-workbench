import { describe, expect, it } from "vitest";
import { normalizeHttpError, normalizeStreamError } from "@/server/ai/errors";
import { LocalEmbeddingProvider } from "@/server/ai/embeddings";
import { splitText } from "@/server/rag";
import { executeTool } from "@/server/tools";
import { providerCatalog } from "@/server/config/models";

describe("core behavior", () => {
  it("normalizes provider errors", () => {
    expect(normalizeHttpError(401, "bad key").kind).toBe("auth");
    expect(normalizeHttpError(429, "slow down").kind).toBe("rate_limit");
    expect(normalizeHttpError(400, "context length exceeded").kind).toBe("context_length");
    expect(normalizeHttpError(503, "unavailable").kind).toBe("server_error");
    expect(normalizeStreamError("SAFETY").kind).toBe("content_filter");
    expect(normalizeStreamError("overloaded_error").kind).toBe("rate_limit");
  });

  it("keeps every required model capability in the provider catalog", () => {
    expect(providerCatalog.map((provider) => provider.id)).toEqual(expect.arrayContaining(["anthropic", "gemini", "openai"]));
    for (const provider of providerCatalog) {
      expect(provider.models.length).toBeGreaterThan(0);
      for (const model of provider.models) {
        expect(model).toEqual(expect.objectContaining({
          supportsTools: expect.any(Boolean),
          supportsVision: expect.any(Boolean),
          supportsJsonSchema: expect.any(Boolean),
          supportsStreaming: expect.any(Boolean),
          contextWindow: expect.any(Number),
          inputUsdPerMillion: expect.any(Number),
          outputUsdPerMillion: expect.any(Number),
        }));
      }
    }
  });

  it("evaluates arithmetic without eval", async () => {
    const result = await executeTool("calculator", JSON.stringify({ expression: "(84 / 7) * 13 + 2^3" }), { retrieval: { topK: 4, threshold: 0.15 } });
    expect(result).toEqual({ result: 164 });
    await expect(executeTool("calculator", JSON.stringify({ expression: "process.exit()" }), { retrieval: { topK: 4, threshold: 0.15 } })).rejects.toThrow("unsupported characters");
  });

  it("produces stable local embeddings and overlapping chunks", async () => {
    const provider = new LocalEmbeddingProvider();
    const [left, right] = await provider.embed(["alpha beta", "alpha beta"]);
    expect(left).toEqual(right);
    const chunks = splitText("First paragraph. ".repeat(80), 240, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 241)).toBe(true);
  });
});
