import type { IncomingMessage, ServerResponse } from "node:http";
import { preflight } from "../src/preflight.js";
import { take, overLimitBody } from "../src/ratelimit.js";
import { clientIp, send, readJson, bearer } from "../src/http.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  let url: string | undefined;
  try {
    if (req.method === "GET") url = new URL(req.url || "/", "http://x").searchParams.get("url") || undefined;
    else if (req.method === "POST") url = (await readJson(req))?.url;
    else return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
  } catch { return send(res, 400, { error: "BAD_JSON" }); }
  if (!url || typeof url !== "string" || url.length > 2048) return send(res, 400, { error: "MISSING_URL", usage: "GET /v1/preflight?url=https://example.com" });
  const q = await take(clientIp(req), bearer(req));
  const rl = { "x-ratelimit-limit": String(q.limit), "x-ratelimit-remaining": String(q.remaining), "x-plan": q.plan };
  if (!q.allowed) return send(res, q.error === "INVALID_API_KEY" ? 401 : q.error === "CREDITS_EXHAUSTED" ? 402 : 429, overLimitBody(q), rl);
  return send(res, 200, await preflight(url), rl);
}
