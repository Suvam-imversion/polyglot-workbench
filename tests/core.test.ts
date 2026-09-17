import { describe, expect, it } from "vitest";
import { normalizeHttpError } from "@/server/ai/errors";
import { LocalEmbeddingProvider } from "@/server/ai/embeddings";
import { splitText } from "@/server/rag";
import { executeTool } from "@/server/tools";

describe("core behavior", () => {
  it("normalizes provider errors", () => {
    expect(normalizeHttpError(401, "bad key").kind).toBe("auth");
    expect(normalizeHttpError(429, "slow down").kind).toBe("rate_limit");
    expect(normalizeHttpError(400, "context length exceeded").kind).toBe("context_length");
    expect(normalizeHttpError(503, "unavailable").kind).toBe("server_error");
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

