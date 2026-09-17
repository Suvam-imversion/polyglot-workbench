# Polyglot AI Workbench

A small full-stack workbench for streaming chat across Anthropic, Gemini, Groq, and OpenAI, with RAG, normalized tools, persistence, fallbacks, and request-level cost/latency metrics.

## Setup (under 5 minutes)

Requirements: Git, Node.js 22+, and at least one provider API key. Set the repository URL from the submission email, then run:

```powershell
$RepositoryUrl = "https://github.com/OWNER/REPOSITORY.git"
git clone $RepositoryUrl polyglot-ai-workbench
Set-Location polyglot-ai-workbench
npm ci
Copy-Item .env.example .env.local
notepad .env.local
npm run dev
```

Add at least one key when Notepad opens, save the file, and open [http://localhost:3000](http://localhost:3000). The sidebar reports which providers are configured. SQLite is created automatically at `data/polyglot.db`.

```dotenv
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
GROQ_API_KEY=...
OPENAI_API_KEY=...
```

Run the checks with:

```powershell
npm test
npm run lint
npm run build
```

For Docker, replace the final `npm run dev` command above with:

```powershell
docker compose up --build
```

Compose exposes `http://localhost:3000`, runs as a non-root user, checks `/api/config`, and stores SQLite data in the named `polyglot-data` volume. It reads the same ignored `.env.local` file as local development, so one key setup works in both environments.

## Status

| Area | Status | Notes |
| --- | --- | --- |
| Anthropic adapter | Done | Messages API; SSE text/tool deltas; usage |
| Gemini adapter | Done | `streamGenerateContent`; function calls; usage/thinking tokens |
| Groq adapter | Done | OpenAI-compatible SSE; tool argument deltas; usage |
| OpenAI adapter | Done | Chat Completions SSE; function argument deltas; usage |
| Streaming chat | Done | True upstream SSE; browser cancellation aborts provider fetch |
| Persistence | Done | SQLite conversations, messages, requests, collections, chunks |
| RAG | Done | PDF/TXT/Markdown; vector or BM25+vector hybrid retrieval; inline chunk IDs and inspector |
| Tool calling | Done | Calculator, Open-Meteo weather, document search; six-round loop |
| Resilience | Done | Timeouts; retry with backoff/jitter; configurable provider fallback |
| Observability | Done | TTFT, latency, token categories, configured cost, retries, fallback |
| Adapter tests | Done | Mocked streaming HTTP fixtures for all four providers |
| Live provider verification | Partial | Gemini text streaming and a complete calculator tool round were tested with a live key; Anthropic, Groq, and OpenAI use mocked streaming fixtures |
| Demo video | Not recorded | Use `docs/DEMO_SCRIPT.md` for a 5-8 minute walkthrough |
| Side-by-side comparison | Not done | Optional; intentionally left out to keep the core easy to repair |
| Docker Compose | Done | Multi-stage non-root image, health check, persistent SQLite volume |

## Structure

```text
src/contracts/ai.ts              provider-neutral contract
src/server/ai/providers/         one adapter file per provider
src/server/config/models.ts      provider catalog, models, capabilities, prices
src/server/ai/orchestrator.ts    retry, fallback, streaming, and tool loop
src/server/tools.ts              three normalized tools
src/server/rag.ts                chunking, vector search, BM25, and rank fusion
src/server/db.ts                 SQLite schema and connection
src/app/api/                     thin HTTP/SSE route handlers
src/components/workbench.tsx     single-screen UI
```

To add a provider, add one adapter file and one `providerCatalog` entry in `src/server/config/models.ts`. Validation, lazy adapter loading, UI labels, model lists, key status, and fallback configuration are all derived from that catalog; no other code changes are needed.

The assignment referenced a seed-repository contract, but no seed repository was supplied in the workspace. The provider-neutral contract is therefore defined in `src/contracts/ai.ts` and this assumption is documented rather than hidden.

## Configuration

Models, context windows, capabilities, prices, and fallback order live in `src/server/config/models.ts`. Prices were checked against official provider pages on 2026-09-17 and should be reviewed before production use.

The default `EMBEDDING_PROVIDER=local` is a deterministic hashed bag-of-words embedding that makes the project run without another paid API. Set it to `openai` or `gemini` to use a hosted embedding adapter. SQLite stores vectors as JSON and computes cosine similarity in-process; this is transparent and adequate for a take-home dataset, but not for a large corpus. Retrieval can use vector similarity alone or hybrid mode, which combines vector and BM25 rankings with reciprocal-rank fusion. A selected collection is a grounded mode: retrieval runs before generation, the UI receives the matched chunks, citations use exact chunk IDs, and no match returns exactly `I don't know.` without calling a model.

## Documents

- [Design](docs/DESIGN.md)
- [Provider notes](docs/PROVIDER_NOTES.md)
- [AI usage](docs/AI_USAGE.md)
- [Demo script](docs/DEMO_SCRIPT.md)

## Known limitations

- PDF extraction handles text PDFs, not scanned-document OCR.
- Local embeddings favor lexical overlap over deep semantics.
- Context sizing uses a conservative character estimate and drops oldest turns first.
- In-flight partial assistant text is not persisted after cancellation.
- This is a single-user local app; authentication and tenant isolation are production work.
- Anthropic, Groq, and OpenAI were not called with live keys during development; their adapters are covered by mocked HTTP streams.
