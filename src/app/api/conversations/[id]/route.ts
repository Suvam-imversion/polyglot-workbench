import { db, type ConversationRow, type MessageRow } from "@/server/db";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const conversation = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  const messages = db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at").all(id) as MessageRow[];
  return Response.json({ conversation, messages: messages.map((message) => ({ ...message, metadata: JSON.parse(message.metadata) })) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  return new Response(null, { status: 204 });
}
