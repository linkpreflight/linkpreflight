// Docker health check: MCP initialize + tools/list handshake over stdio. Exits 0 when the preflight tool is listed.
import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["--import", "tsx", "scripts/stdio.ts"], { stdio: ["pipe", "pipe", "inherit"] });
const timer = setTimeout(() => { child.kill(); process.exit(1); }, 10000);
let buf = "";
child.stdout.on("data", (d) => {
  buf += d;
  for (const line of buf.split("\n").slice(0, -1)) {
    try { const m = JSON.parse(line); if (m.id === 2 && m.result?.tools?.some((t: any) => t.name === "preflight")) { clearTimeout(timer); child.kill(); console.log("healthy"); process.exit(0); } } catch {}
  }
});
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "healthcheck", version: "1" } } }) + "\n");
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
