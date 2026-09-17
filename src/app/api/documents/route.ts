import { db } from "@/server/db";
import { getEmbeddingProvider } from "@/server/ai/embeddings";
import { splitText } from "@/server/rag";

export const runtime = "nodejs";

const allowedTypes = new Set(["text/plain", "text/markdown", "application/pdf"]);

async function extractText(file: File) {
  if (file.type !== "application/pdf") return file.text();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n\n");
}

export async function GET() {
  const collections = db.prepare(`
    SELECT collections.id, collections.name, collections.created_at,
      COUNT(DISTINCT documents.id) AS document_count, COUNT(chunks.id) AS chunk_count
    FROM collections
    LEFT JOIN documents ON documents.collection_id = collections.id
    LEFT JOIN chunks ON chunks.collection_id = collections.id
    GROUP BY collections.id ORDER BY collections.created_at DESC
  `).all();
  return Response.json({ collections });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;
  if (!files.length || files.length > 10) return Response.json({ error: "Upload 1 to 10 files" }, { status: 400 });
  if (files.some((file) => !allowedTypes.has(file.type) || file.size > maxBytes)) {
    return Response.json({ error: "Only PDF, TXT, or Markdown files within the size limit are allowed" }, { status: 400 });
  }

  const chunkSize = Math.max(200, Math.min(Number(form.get("chunkSize") ?? 1000), 4000));
  const overlap = Math.max(0, Math.min(Number(form.get("overlap") ?? 150), Math.floor(chunkSize / 2)));
  let collectionId = String(form.get("collectionId") ?? "");
  const existing = collectionId ? db.prepare("SELECT id FROM collections WHERE id = ?").get(collectionId) : null;
  if (!existing) {
    collectionId = crypto.randomUUID();
    const name = String(form.get("collectionName") ?? files[0].name.replace(/\.[^.]+$/, "")).slice(0, 100) || "Documents";
    db.prepare("INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)").run(collectionId, name, new Date().toISOString());
  }

  let totalChunks = 0;
  for (const file of files) {
    const text = await extractText(file);
    if (!text.trim()) continue;
    const chunks = splitText(text, chunkSize, overlap);
    const embeddings = await getEmbeddingProvider().embed(chunks);
    const documentId = crypto.randomUUID();
    const insertDocument = db.prepare("INSERT INTO documents (id, collection_id, name, mime_type, created_at) VALUES (?, ?, ?, ?, ?)");
    const insertChunk = db.prepare("INSERT INTO chunks (id, document_id, collection_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?, ?)");
    db.transaction(() => {
      insertDocument.run(documentId, collectionId, file.name.slice(0, 255), file.type, new Date().toISOString());
      chunks.forEach((chunk, index) => {
        insertChunk.run(crypto.randomUUID(), documentId, collectionId, index, chunk, JSON.stringify(embeddings[index]));
      });
    })();
    totalChunks += chunks.length;
  }

  return Response.json({ collectionId, files: files.length, chunks: totalChunks }, { status: 201 });
}
