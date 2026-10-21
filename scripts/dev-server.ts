import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import pre from "../api/preflight.js"; import mcp from "../api/mcp.js"; import wh from "../api/stripe-webhook.js"; import ok from "../api/success.js";
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const p = new URL(req.url || "/", "http://x").pathname;
  if (p === "/v1/preflight" || p === "/api/preflight") return pre(req, res);
  if (p === "/stripe/webhook") return wh(req, res);
  if (p === "/success") return ok(req, res);
  if (p === "/mcp" || p === "/api/mcp") return mcp(req, res);
  const f = path.join("public", p === "/" ? "index.html" : path.normalize(p).replace(/^\/+/, ""));
  if (f.startsWith("public") && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "text/plain; charset=utf-8" }); return fs.createReadStream(f).pipe(res); }
  res.writeHead(404); res.end("not found");
}).listen(port, () => console.log(`dev on :${port}`));
