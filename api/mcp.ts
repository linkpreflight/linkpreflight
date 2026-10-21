// Minimal stateless MCP server over Streamable HTTP (JSON responses, no SSE). Protocol 2025-06-18.
import type { IncomingMessage, ServerResponse } from "node:http";
import { preflight } from "../src/preflight.js";
import { take, overLimitBody } from "../src/ratelimit.js";
import { clientIp, send, readJson, bearer } from "../src/http.js";

const TOOL = {
  name: "preflight",
  title: "Link Preflight",
  description: "Check a URL before you click, cite, or fetch it. Returns HTTP status, redirect chain and final URL, dead/parked-domain detection, content-type and size, whether /llms.txt exists, and phishing/abuse flags from public feeds plus heuristics. One call, no page content extraction. Free: 200 checks/day.",
  inputSchema: { type: "object", properties: { url: { type: "string", description: "Absolute http(s) URL or bare domain" } }, required: ["url"] },
  annotations: { readOnlyHint: true, openWorldHint: true },
};

async function handle(msg: any, ip: string, key?: string) {
  const { id, method, params } = msg || {};
  const ok = (result: any) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string, data?: any) => ({ jsonrpc: "2.0", id, error: { code, message, data } });
  switch (method) {
    case "initialize":
      return ok({ protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "linkpreflight", title: "LinkPreflight", version: "0.1.0" }, instructions: "Call preflight(url) before visiting or citing any link." });
    case "ping": return ok({});
    case "tools/list": return ok({ tools: [TOOL] });
    case "tools/call": {
      if (params?.name !== "preflight") return err(-32602, "unknown tool");
      const url = params?.arguments?.url;
      if (typeof url !== "string" || !url || url.length > 2048) return err(-32602, "url required");
      const q = await take(ip, key);
      if (!q.allowed) { const b = overLimitBody(q); return ok({ isError: true, content: [{ type: "text", text: `${b.message} ${b.payment_link ?? ""}`.trim() }], structuredContent: b }); }
      const r = await preflight(url);
      return ok({ content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r });
    }
    default:
      if (id === undefined) return null; // notification
      return err(-32601, `method not found: ${method}`);
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET") return send(res, 405, { error: "SSE not supported; POST JSON-RPC to this endpoint" }, { allow: "POST" });
  if (req.method === "DELETE") return send(res, 200, {});
  if (req.method !== "POST") return send(res, 405, {});
  let body: any;
  try { body = await readJson(req); } catch { return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
  const ip = clientIp(req); const key = bearer(req);
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.slice(0, 10).map(m => handle(m, ip, key)))).filter(Boolean);
    return out.length ? send(res, 200, out) : (res.writeHead(202), res.end());
  }
  const out = await handle(body, ip, key);
  if (!out) { res.writeHead(202); return res.end(); }
  return send(res, 200, out);
}
