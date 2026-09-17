import { z } from "zod";
import type { ChatMessage } from "@/contracts/ai";
import { runChat } from "@/server/ai/orchestrator";
import { models } from "@/server/config/models";
import { db } from "@/server/db";

export const runtime = "nodejs";

const inputSchema = z.object({
  conversationId: z.string().uuid(),
  provider: z.enum(["openai", "anthropic", "gemini"]),
  model: z.string().min(1).max(100),
  message: z.string().trim().min(1).max(30_000),
  collectionId: z.string().uuid().optional(),
  topK: z.number().int().min(1).max(12).default(4),
  threshold: z.number().min(-1).max(1).default(0.15),
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid chat request" }, { status: 400 });
  const input = parsed.data;
  if (!models.some((model) => model.provider === input.provider && model.id === input.model)) {
    return Response.json({ error: "Unknown provider/model combination" }, { status: 400 });
  }
  const conversation = db.prepare("SELECT id FROM conversations WHERE id = ?").get(input.conversationId);
  if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

  const now = new Date().toISOString();
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, metadata, created_at) VALUES (?, ?, 'user', ?, '{}', ?)")
    .run(crypto.randomUUID(), input.conversationId, input.message, now);
  db.prepare("UPDATE conversations SET title = CASE WHEN title = 'New conversation' THEN ? ELSE title END, updated_at = ? WHERE id = ?")
    .run(input.message.slice(0, 48), now, input.conversationId);

  const rows = db.prepare("SELECT role, content, metadata FROM messages WHERE conversation_id = ? ORDER BY created_at")
    .all(input.conversationId) as Array<{ role: "user" | "assistant"; content: string; metadata: string }>;
  const messages: ChatMessage[] = rows.map((row) => ({ role: row.role, content: row.content }));
  const timeout = AbortSignal.timeout(Number(process.env.REQUEST_TIMEOUT_MS ?? 60_000));
  const signal = AbortSignal.any([request.signal, timeout]);
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runChat(messages, { ...input, signal })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
