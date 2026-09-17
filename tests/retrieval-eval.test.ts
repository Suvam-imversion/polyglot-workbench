import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import dataset from "./fixtures/retrieval-golden.json";

const directory = mkdtempSync(path.join(tmpdir(), "polyglot-retrieval-"));
const databasePath = path.join(directory, "evaluation.db");
let database: Database.Database;
let searchDocuments: typeof import("@/server/rag").searchDocuments;

describe("hybrid retrieval evaluation", () => {
  beforeAll(async () => {
    vi.stubEnv("DATABASE_PATH", databasePath);
    vi.stubEnv("EMBEDDING_PROVIDER", "local");
    const databaseModule = await import("@/server/db");
    const embeddingsModule = await import("@/server/ai/embeddings");
    const ragModule = await import("@/server/rag");
    database = databaseModule.db;
    searchDocuments = ragModule.searchDocuments;

    const collectionId = "00000000-0000-4000-8000-000000000099";
    database.prepare("INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)")
      .run(collectionId, "Golden retrieval set", new Date(0).toISOString());
    const embeddings = await new embeddingsModule.LocalEmbeddingProvider().embed(dataset.documents.map((document) => document.content));
    dataset.documents.forEach((document, index) => {
      const documentId = `00000000-0000-4000-8000-0000000001${index}`;
      database.prepare("INSERT INTO documents (id, collection_id, name, mime_type, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(documentId, collectionId, document.name, "text/markdown", new Date(0).toISOString());
      database.prepare("INSERT INTO chunks (id, document_id, collection_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?, ?)")
        .run(`00000000-0000-4000-8000-0000000002${index}`, documentId, collectionId, 0, document.content, JSON.stringify(embeddings[index]));
    });
  });

  afterAll(() => {
    database?.close();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });

  it("returns the expected document first for every golden query", async () => {
    const collectionId = "00000000-0000-4000-8000-000000000099";
    const results = await Promise.all(dataset.queries.map(async (item) => {
      const [top] = await searchDocuments(collectionId, item.query, { topK: 1, threshold: 0.15, mode: "hybrid" });
      return top?.documentName === item.expectedDocument;
    }));

    expect(results.filter(Boolean)).toHaveLength(dataset.queries.length);
  });
});
