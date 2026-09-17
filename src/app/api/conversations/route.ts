import { z } from "zod";
import { db, type ConversationRow } from "@/server/db";
import { getModel, getProviderConfig, providerCatalog } from "@/server/config/models";

export const runtime = "nodejs";

export async function GET() {
  const conversations = db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC").all() as ConversationRow[];
  return Response.json({ conversations });
}

const createSchema = z.object({
  provider: z.string().default(providerCatalog[0].id),
  model: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (!getProviderConfig(parsed.data.provider)) return Response.json({ error: "Unknown provider" }, { status: 400 });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const model = getModel(parsed.data.provider, parsed.data.model).id;
  db.prepare("INSERT INTO conversations (id, title, provider, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, "New conversation", parsed.data.provider, model, now, now);
  return Response.json({ id, title: "New conversation", provider: parsed.data.provider, model }, { status: 201 });
}
