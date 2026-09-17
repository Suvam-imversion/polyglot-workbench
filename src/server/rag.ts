import { db } from "@/server/db";
import { getEmbeddingProvider } from "@/server/ai/embeddings";

export type RetrievalMode = "vector" | "hybrid";
export type RetrievalOptions = { topK: number; threshold: number; mode?: RetrievalMode };
export type RetrievedChunk = {
  id: string;
  documentName: string;
  content: string;
  score: number;
  chunkIndex: number;
  retrievalMode: RetrievalMode;
};

type StoredChunk = {
  id: string;
  chunk_index: number;
  content: string;
  embedding: string;
  document_name: string;
};

const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "were", "what", "with"]);

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

function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((term) => term.length > 1 && !stopWords.has(term));
}

export function bm25Scores(documents: string[], query: string) {
  const queryTerms = [...new Set(terms(query))];
  const tokenized = documents.map(terms);
  const averageLength = tokenized.reduce((sum, document) => sum + document.length, 0) / Math.max(tokenized.length, 1);
  const documentFrequency = new Map<string, number>();
  tokenized.forEach((document) => new Set(document).forEach((term) => {
    documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }));
  const k1 = 1.2;
  const b = 0.75;

  return tokenized.map((document) => {
    const frequencies = new Map<string, number>();
    document.forEach((term) => frequencies.set(term, (frequencies.get(term) ?? 0) + 1));
    return queryTerms.reduce((score, term) => {
      const frequency = frequencies.get(term) ?? 0;
      if (!frequency) return score;
      const containing = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (tokenized.length - containing + 0.5) / (containing + 0.5));
      const lengthRatio = document.length / Math.max(averageLength, 1);
      return score + idf * (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * lengthRatio));
    }, 0);
  });
}

export function reciprocalRankFusion(rankings: string[][], rankConstant = 60) {
  const scores = new Map<string, number>();
  rankings.forEach((ranking) => ranking.forEach((id, index) => {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (rankConstant + index + 1));
  }));
  return [...scores.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

export async function searchDocuments(collectionId: string, query: string, options: RetrievalOptions) {
  const [queryVector] = await getEmbeddingProvider().embed([query]);
  const rows = db.prepare(`
    SELECT chunks.id, chunks.chunk_index, chunks.content, chunks.embedding, documents.name AS document_name
    FROM chunks JOIN documents ON documents.id = chunks.document_id
    WHERE chunks.collection_id = ?
  `).all(collectionId) as StoredChunk[];

  const vectorResults = rows.map((row) => ({
      id: row.id,
      documentName: row.document_name,
      content: row.content,
      chunkIndex: row.chunk_index,
      score: cosine(queryVector, JSON.parse(row.embedding)),
      retrievalMode: "vector" as const,
    }));
  const limit = Math.max(1, Math.min(options.topK, 12));
  if ((options.mode ?? "hybrid") === "vector") {
    return vectorResults
    .filter((chunk) => chunk.score >= options.threshold)
    .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  const keywordScores = bm25Scores(rows.map((row) => row.content), query);
  const vectorRanking = vectorResults
    .filter((chunk) => chunk.score >= options.threshold)
    .sort((left, right) => right.score - left.score)
    .map((chunk) => chunk.id);
  const keywordRanking = rows
    .map((row, index) => ({ id: row.id, score: keywordScores[index] }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.id);
  const fused = reciprocalRankFusion([vectorRanking, keywordRanking]);
  const maximumRrfScore = 2 / 61;
  const byId = new Map(vectorResults.map((chunk) => [chunk.id, chunk]));

  return fused.slice(0, limit).map(([id, score]) => ({
    ...byId.get(id)!,
    score: Math.min(1, score / maximumRrfScore),
    retrievalMode: "hybrid" as const,
  }));
}
