// LinkPreflight MCP server over stdio (newline-delimited JSON-RPC). Glama/mcp-proxy wraps this as HTTP.
import readline from "node:readline";
import { handle } from "../api/mcp.js";
const rl = readline.createInterface({ input: process.stdin });
const write = (m: unknown) => process.stdout.write(JSON.stringify(m) + "\n");
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg: any;
  try { msg = JSON.parse(line); } catch { return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
  const msgs = Array.isArray(msg) ? msg : [msg];
  for (const m of msgs) {
    try { const out = await handle(m, "stdio"); if (out) write(out); }
    catch (e: any) { write({ jsonrpc: "2.0", id: m?.id ?? null, error: { code: -32603, message: String(e?.message || e) } }); }
  }
});
