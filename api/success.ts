// Success page after Payment Link checkout: /success?session_id=cs_...
import type { IncomingMessage, ServerResponse } from "node:http";
import { kv } from "../src/store.js";
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const sid = new URL(req.url || "/", "http://x").searchParams.get("session_id") || "";
  let body: string;
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,}$/.test(sid)) body = "<p>Missing or invalid session.</p>";
  else {
    const key = await kv.get(`sess:${sid}`);
    const left = key ? await kv.get(`key:${key}`) : null;
    body = key ? `<p>Thanks! Your API key (${esc(left || "0")} credits):</p><pre>${esc(key)}</pre><p>Send it as <code>Authorization: Bearer &lt;key&gt;</code> to <code>/v1/preflight</code> or <code>/mcp</code>. Save it now; this page is the only place it is shown, and it stays tied to your checkout session link.</p>`
      : `<p>Payment received. Your key is being issued. This page refreshes in 3 seconds.</p><meta http-equiv="refresh" content="3">`;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>LinkPreflight: your key</title><style>body{font:16px system-ui;max-width:640px;margin:40px auto;padding:0 20px}pre{background:#f3f3f3;padding:12px;border-radius:6px}</style></head><body><h1>LinkPreflight</h1>${body}<p><a href="/">Home</a></p></body></html>`);
}
