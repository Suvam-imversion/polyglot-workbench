export interface EmbeddingProvider {
  readonly id: "local" | "openai" | "gemini";
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}

const DIMENSIONS = 256;

function hashToken(token: string) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = "local" as const;

  async embed(texts: string[]) {
    return texts.map((text) => {
      const vector = Array.from({ length: DIMENSIONS }, () => 0);
      for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
        const hash = hashToken(token);
        vector[hash % DIMENSIONS] += (hash & 1) === 0 ? 1 : -1;
      }
      const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
      return vector.map((value) => value / magnitude);
    });
  }
}

class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly id = "openai" as const;

  async embed(texts: string[], signal?: AbortSignal) {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
    });
    if (!response.ok) throw new Error("Embedding request failed");
    const body = await response.json();
    return body.data.map((item: { embedding: number[] }) => item.embedding);
  }
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly id = "gemini" as const;

  async embed(texts: string[], signal?: AbortSignal) {
    const key = process.env.GEMINI_API_KEY ?? "";
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents", {
      method: "POST",
      signal,
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
        })),
      }),
    });
    if (!response.ok) throw new Error("Embedding request failed");
    const body = await response.json();
    return body.embeddings.map((item: { values: number[] }) => item.values);
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (process.env.EMBEDDING_PROVIDER === "openai") return new OpenAiEmbeddingProvider();
  if (process.env.EMBEDDING_PROVIDER === "gemini") return new GeminiEmbeddingProvider();
  return new LocalEmbeddingProvider();
}

