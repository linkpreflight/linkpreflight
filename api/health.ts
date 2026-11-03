// Lightweight liveness endpoint: GET /health -> {"ok":true}
import type { IncomingMessage, ServerResponse } from "node:http";
import { send } from "../src/http.js";
export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  return send(res, 200, { ok: true, service: "linkpreflight" });
}
