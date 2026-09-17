import { db } from "@/server/db";
import { getEmbeddingProvider } from "@/server/ai/embeddings";

export type RetrievalOptions = { topK: number; threshold: number };
export type RetrievedChunk = { id: string; documentName: string; content: string; score: number; chunkIndex: number };

export function splitText(text: string, chunkSize: number, overlap: number) {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const chunks: string[] = [];
  const safeSize = Math.max(200, Math.min(chunkSize, 4000));
  const safeOverlap = Math.max(0, Math.min(overlap, Math.floor(safeSize / 2)));
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + safeSize, clean.length);
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf("\n", end), clean.lastIndexOf(". ", end));
      if (boundary > start + safeSize * 0.6) end = boundary + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end === clean.length) break;
    start = Math.max(start + 1, end - safeOverlap);
  }
  return chunks.filter(Boolean);
}

function cosine(left: number[], right: number[]) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return dot / ((Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)) || 1);
}

export async function searchDocuments(collectionId: string, query: string, options: RetrievalOptions) {
  const [queryVector] = await getEmbeddingProvider().embed([query]);
  const rows = db.prepare(`
    SELECT chunks.id, chunks.chunk_index, chunks.content, chunks.embedding, documents.name AS document_name
    FROM chunks JOIN documents ON documents.id = chunks.document_id
    WHERE chunks.collection_id = ?
  `).all(collectionId) as Array<{
    id: string;
    chunk_index: number;
    content: string;
    embedding: string;
    document_name: string;
  }>;

  return rows
    .map((row) => ({
      id: row.id,
      documentName: row.document_name,
      content: row.content,
      chunkIndex: row.chunk_index,
      score: cosine(queryVector, JSON.parse(row.embedding)),
    }))
    .filter((chunk) => chunk.score >= options.threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(options.topK, 12))) as RetrievedChunk[];
}

