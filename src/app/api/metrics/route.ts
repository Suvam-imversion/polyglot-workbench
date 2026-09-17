import { db } from "@/server/db";

export const runtime = "nodejs";

export async function GET() {
  const aggregate = db.prepare(`
    SELECT provider, COUNT(*) AS requests, ROUND(SUM(cost_usd), 6) AS spend,
      ROUND(AVG(total_ms)) AS average_latency_ms, ROUND(AVG(first_token_ms)) AS average_ttft_ms,
      SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
    FROM requests GROUP BY provider ORDER BY provider
  `).all();
  const recent = db.prepare("SELECT * FROM requests ORDER BY started_at DESC LIMIT 20").all();
  return Response.json({ aggregate, recent });
}

