# Polyglot AI Workbench

A small full-stack workbench for streaming chat across Anthropic, Gemini, and OpenAI, with RAG, normalized tools, persistence, fallbacks, and request-level cost/latency metrics.

## Setup (under 5 minutes)

Requirements: Node.js 22+ and at least one provider API key.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Add keys to `.env.local`, then open [http://localhost:3000](http://localhost:3000). The sidebar shows which keys are available. SQLite is created automatically at `data/polyglot.db`.

```dotenv
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

Run the checks with:

```powershell
npm test
npm run lint
npm run build
```

## Status

| Area | Status | Notes |
| --- | --- | --- |
| Anthropic adapter | Done | Messages API; SSE text/tool deltas; usage |
| Gemini adapter | Done | `streamGenerateContent`; function calls; usage/thinking tokens |
| OpenAI adapter | Done | Chat Completions SSE; function argument deltas; usage |
| Streaming chat | Done | True upstream SSE; browser cancellation aborts provider fetch |
| Persistence | Done | SQLite conversations, messages, requests, collections, chunks |
| RAG | Done | PDF/TXT/Markdown; multi-file collections; inline chunk IDs and inspector |
| Tool calling | Done | Calculator, Open-Meteo weather, document search; six-round loop |
| Resilience | Done | Timeouts; retry with backoff/jitter; configurable provider fallback |
| Observability | Done | TTFT, latency, token categories, configured cost, retries, fallback |
| Adapter tests | Done | Mocked streaming HTTP fixtures for all three providers |
| Live provider verification | Needs keys | Adapters are fixture-tested; add keys to verify the current account/model access |
| Demo video | Not recorded | Use `docs/DEMO_SCRIPT.md` for a 5-8 minute walkthrough |
| Side-by-side comparison | Not done | Optional; intentionally left out to keep the core easy to repair |
| Docker Compose | Not done | Optional; local Node + SQLite setup is already one process |

## Structure

```text
src/contracts/ai.ts              provider-neutral contract
src/server/ai/providers/         one file per provider + one registry
src/server/ai/orchestrator.ts    retry, fallback, streaming, and tool loop
src/server/tools.ts              three normalized tools
src/server/rag.ts                chunking and similarity search
src/server/db.ts                 SQLite schema and connection
src/app/api/                     thin HTTP/SSE route handlers
src/components/workbench.tsx     single-screen UI
```

To add a provider, add one adapter file and one registry/config entry. No orchestration, tool, persistence, or UI code needs vendor-specific logic.

The assignment referenced a seed-repository contract, but no seed repository was supplied in the workspace. The provider-neutral contract is therefore defined in `src/contracts/ai.ts` and this assumption is documented rather than hidden.

## Configuration

Models, context windows, capabilities, prices, and fallback order live in `src/server/config/models.ts`. Prices were checked against official provider pages on 2026-09-17 and should be reviewed before production use.

The default `EMBEDDING_PROVIDER=local` is a deterministic hashed bag-of-words embedding that makes the project run without another paid API. Set it to `openai` or `gemini` to use a hosted embedding adapter. SQLite stores vectors as JSON and computes cosine similarity in-process; this is transparent and adequate for a take-home dataset, but not for a large corpus.

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
