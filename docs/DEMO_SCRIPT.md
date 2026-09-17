# Demo Script (5-8 minutes)

1. Run `docker compose up --build`, open the healthy application, and point out the persistent SQLite volume and API-key status.
2. Stream one answer, switch provider/model in the same conversation, and reload to prove persistence.
3. Ask for a weather lookup and a two-step calculation; show streamed tool status.
4. Upload two small documents, compare Vector and Hybrid retrieval, and show how BM25 preserves exact identifiers while vectors capture semantic matches. Inspect citations, then ask an unrelated question to show the "I don't know" policy.
5. Open Metrics and show TTFT, latency, token counts, cost, retries, and provider totals.
6. Walk through `src/contracts/ai.ts`, one provider adapter, `providers/index.ts`, and `models.ts` to explain how one new file plus configuration adds a provider.
7. Close with tests, security choices, known limitations, and what would change for production.
