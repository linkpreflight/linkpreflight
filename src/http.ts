import type { IncomingMessage, ServerResponse } from "node:http";
export function clientIp(req: IncomingMessage) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || String(req.headers["x-real-ip"] || req.socket.remoteAddress || "unknown");
}
export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, x-api-key, mcp-session-id, mcp-protocol-version", "access-control-allow-methods": "GET, POST, OPTIONS", ...headers });
  res.end(JSON.stringify(body, null, 2));
}
export async function readJson(req: IncomingMessage & { body?: any }): Promise<any> {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  let s = ""; let n = 0;
  for await (const c of req) { n += c.length; if (n > 100_000) throw new Error("body too large"); s += c; }
  return s ? JSON.parse(s) : {};
}
export function bearer(req: IncomingMessage): string | undefined {
  const h = String(req.headers.authorization || ""); const m = h.match(/^Bearer\s+(\S+)$/i);
  return m?.[1] || (req.headers["x-api-key"] as string | undefined) || undefined;
}
export async function readRaw(req: IncomingMessage & { body?: any }): Promise<string> {
  let s = ""; for await (const c of req) { s += c; if (s.length > 1_000_000) throw new Error("too large"); } return s;
}
