import { db } from "@/server/db";
import { getEmbeddingProvider } from "@/server/ai/embeddings";
import { splitText } from "@/server/rag";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";

const allowedExtensions = new Set([".pdf", ".txt", ".md", ".markdown"]);
const allowedTypes = new Set(["", "text/plain", "text/markdown", "application/pdf"]);

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

async function hasValidSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (extensionOf(file.name) === ".pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  return !bytes.includes(0);
}

async function extractText(file: File) {
  if (extensionOf(file.name) !== ".pdf") return file.text();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = process.env.PDFJS_WORKER_PATH ?? path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
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
    GROUP BY collections.id
    HAVING COUNT(chunks.id) > 0
    ORDER BY collections.created_at DESC
  `).all();
  return Response.json({ collections });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;
  const maxTotalBytes = Number(process.env.MAX_TOTAL_UPLOAD_MB ?? 25) * 1024 * 1024;
  if (!files.length || files.length > 10) return Response.json({ error: "Upload 1 to 10 files" }, { status: 400 });
  if (files.reduce((total, file) => total + file.size, 0) > maxTotalBytes) {
    return Response.json({ error: "Combined upload exceeds the total size limit" }, { status: 413 });
  }
  if (files.some((file) => !allowedExtensions.has(extensionOf(file.name)) || !allowedTypes.has(file.type) || file.size > maxBytes)) {
    return Response.json({ error: "Only PDF, TXT, or Markdown files within the size limit are allowed" }, { status: 400 });
  }
  if (!(await Promise.all(files.map(hasValidSignature))).every(Boolean)) {
    return Response.json({ error: "A file's content does not match an allowed document type" }, { status: 400 });
  }

  const chunkSize = Math.max(200, Math.min(Number(form.get("chunkSize") ?? 1000), 4000));
  const overlap = Math.max(0, Math.min(Number(form.get("overlap") ?? 150), Math.floor(chunkSize / 2)));
  const prepared: Array<{ file: File; chunks: string[]; embeddings: number[][] }> = [];
  try {
    for (const file of files) {
      const text = await extractText(file);
      if (!text.trim()) continue;
      const chunks = splitText(text, chunkSize, overlap);
      const embeddings = await getEmbeddingProvider().embed(chunks);
      prepared.push({ file, chunks, embeddings });
    }
  } catch {
    return Response.json({ error: "A document could not be parsed or indexed" }, { status: 422 });
  }
  if (!prepared.length) {
    return Response.json({ error: "No readable text was found in the uploaded files" }, { status: 422 });
  }

  let collectionId = String(form.get("collectionId") ?? "");
  const existing = collectionId ? db.prepare("SELECT id FROM collections WHERE id = ?").get(collectionId) : null;
  if (!existing) {
    collectionId = crypto.randomUUID();
  }

  let totalChunks = 0;
  const insertCollection = db.prepare("INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)");
  const insertDocument = db.prepare("INSERT INTO documents (id, collection_id, name, mime_type, created_at) VALUES (?, ?, ?, ?, ?)");
  const insertChunk = db.prepare("INSERT INTO chunks (id, document_id, collection_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?, ?)");
  db.transaction(() => {
    if (!existing) {
      const name = String(form.get("collectionName") ?? prepared[0].file.name.replace(/\.[^.]+$/, "")).slice(0, 100) || "Documents";
      insertCollection.run(collectionId, name, new Date().toISOString());
    }
    for (const item of prepared) {
      const documentId = crypto.randomUUID();
      insertDocument.run(documentId, collectionId, item.file.name.slice(0, 255), item.file.type, new Date().toISOString());
      item.chunks.forEach((chunk, index) => {
        insertChunk.run(crypto.randomUUID(), documentId, collectionId, index, chunk, JSON.stringify(item.embeddings[index]));
      });
      totalChunks += item.chunks.length;
    }
  })();

  return Response.json({ collectionId, files: prepared.length, chunks: totalChunks }, { status: 201 });
}
