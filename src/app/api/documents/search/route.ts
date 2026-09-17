import { z } from "zod";
import { searchDocuments } from "@/server/rag";

export const runtime = "nodejs";

const schema = z.object({
  collectionId: z.string().uuid(),
  query: z.string().trim().min(1).max(2000),
  topK: z.number().int().min(1).max(12).default(4),
  threshold: z.number().min(-1).max(1).default(0.15),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid search request" }, { status: 400 });
  const { collectionId, query, ...options } = parsed.data;
  return Response.json({ chunks: await searchDocuments(collectionId, query, options) });
}

