import { kv } from "./store.js";
export const limit = () => Number(process.env.FREE_DAILY_LIMIT || 200);
export const PACK_CREDITS = 25000;

export type Quota = { allowed: boolean; remaining: number; limit: number; plan: "free" | "credits"; error?: string };

/** Paid key (lp_...) spends credits; otherwise the free daily allowance per IP. */
export async function take(ip: string, apiKey?: string): Promise<Quota> {
  if (apiKey) {
    if (!/^lp_[a-f0-9]{40}$/.test(apiKey)) return { allowed: false, remaining: 0, limit: 0, plan: "credits", error: "INVALID_API_KEY" };
    const exists = await kv.get(`key:${apiKey}`);
    if (exists === null) return { allowed: false, remaining: 0, limit: 0, plan: "credits", error: "INVALID_API_KEY" };
    const left = await kv.incrby(`key:${apiKey}`, -1);
    if (left < 0) { await kv.incrby(`key:${apiKey}`, 1); return { allowed: false, remaining: 0, limit: PACK_CREDITS, plan: "credits", error: "CREDITS_EXHAUSTED" }; }
    return { allowed: true, remaining: left, limit: PACK_CREDITS, plan: "credits" };
  }
  const k = `rl:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const used = await kv.incrby(k, 1);
  if (used === 1) await kv.expire(k, 90000);
  const lim = limit();
  return { allowed: used <= lim, remaining: Math.max(0, lim - used), limit: lim, plan: "free", error: used > lim ? "FREE_TIER_EXHAUSTED" : undefined };
}
export function overLimitBody(q: Quota) {
  const msg = q.error === "INVALID_API_KEY" ? "Unknown API key." : q.error === "CREDITS_EXHAUSTED" ? "This key has no credits left. Buy another pack." : `Free tier is ${limit()} checks/day per IP. Buy a 25k-check pack ($10) and send the key as 'Authorization: Bearer lp_...'.`;
  return { error: q.error, message: msg, payment_link: process.env.PAYMENT_LINK_URL || null, resets: q.plan === "free" ? "00:00 UTC" : undefined };
}
