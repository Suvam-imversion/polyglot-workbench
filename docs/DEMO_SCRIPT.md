# Demo Script (5-8 minutes)

1. Show `.env.example`, run `npm install` and `npm run dev`, then point out API-key status in the sidebar.
2. Stream one answer, switch provider/model in the same conversation, and reload to prove persistence.
3. Ask for a weather lookup and a two-step calculation; show streamed tool status.
4. Upload two small documents, adjust chunk size/top-k/threshold, ask a grounded question, and inspect cited chunks. Ask an unrelated question to show the "I don't know" policy.
5. Open Metrics and show TTFT, latency, token counts, cost, retries, and provider totals.
6. Walk through `src/contracts/ai.ts`, one provider adapter, `providers/index.ts`, and `models.ts` to explain how one new file plus configuration adds a provider.
7. Close with tests, security choices, known limitations, and what would change for production.

