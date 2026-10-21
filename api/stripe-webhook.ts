// Stripe webhook: checkout.session.completed -> issue lp_ key with 25k credits.
// Needs env STRIPE_WEBHOOK_SECRET and a configured store. Body parsing must stay raw.
import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { kv, storeConfigured } from "../src/store.js";
import { PACK_CREDITS } from "../src/ratelimit.js";
import { send, readRaw } from "../src/http.js";

export const config = { api: { bodyParser: false } };

export function verify(raw: string, header: string, secret: string, tolSec = 300): boolean {
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=") as [string, string]).filter(p => p.length === 2)) as any;
  const sigs = header.split(",").filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  const t = Number(parts.t); if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > tolSec) return false;
  const exp = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some(s => s.length === exp.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp)));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return send(res, 405, {});
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !storeConfigured) return send(res, 503, { error: "NOT_CONFIGURED" });
  const raw = await readRaw(req);
  if (!verify(raw, String(req.headers["stripe-signature"] || ""), secret)) return send(res, 400, { error: "BAD_SIGNATURE" });
  const evt = JSON.parse(raw);
  if (evt.type !== "checkout.session.completed") return send(res, 200, { ignored: evt.type });
  const s = evt.data.object;
  if (s.payment_status !== "paid") return send(res, 200, { ignored: "unpaid" });
  const key = "lp_" + crypto.randomBytes(20).toString("hex");
  // idempotent per session: first writer wins
  if (await kv.setnx(`sess:${s.id}`, key)) await kv.set(`key:${key}`, String(PACK_CREDITS));
  return send(res, 200, { received: true });
}
