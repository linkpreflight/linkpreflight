// Keyless threat feeds, cached in memory. URLhaus keyless downloads now return 410 (key required), so skipped.
const OPENPHISH = "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt";
const TTL = 30 * 60 * 1000;
let cache: { at: number; urls: Set<string>; hosts: Set<string> } | null = null;
let inflight: Promise<void> | null = null;

const norm = (s: string) => s.trim().toLowerCase().replace(/\/+$/, "");

async function refresh() {
  const r = await fetch(OPENPHISH, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`feed ${r.status}`);
  const lines = (await r.text()).split("\n").filter(Boolean);
  const urls = new Set<string>(), hosts = new Set<string>();
  for (const l of lines) { urls.add(norm(l)); try { hosts.add(new URL(l.trim()).hostname.toLowerCase()); } catch {} }
  cache = { at: Date.now(), urls, hosts };
}

export async function checkFeeds(urls: string[]) {
  if (!cache || Date.now() - cache.at > TTL) {
    inflight ??= refresh().catch(() => {}).finally(() => { inflight = null; });
    await inflight;
  }
  if (!cache) return { checked: false, sources: ["openphish"], listed: false, matches: [] as string[] };
  const matches: string[] = [];
  for (const u of urls) {
    if (cache.urls.has(norm(u))) matches.push(`openphish:url:${u}`);
    else { try { const h = new URL(u).hostname.toLowerCase(); if (cache.hosts.has(h)) matches.push(`openphish:host:${h}`); } catch {} }
  }
  return { checked: true, sources: ["openphish"], listed: matches.length > 0, matches, feed_size: cache.urls.size, feed_age_s: Math.round((Date.now() - cache.at) / 1000) };
}

const RISKY_TLDS = new Set(["zip", "mov", "top", "xyz", "tk", "ml", "ga", "cf", "gq", "click", "country", "kim", "work", "rest"]);
export function heuristics(u: URL): string[] {
  const f: string[] = [];
  const h = u.hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) f.push("ip_literal_host");
  if (h.split(".").some(p => p.startsWith("xn--"))) f.push("punycode_host");
  if (RISKY_TLDS.has(h.split(".").pop() || "")) f.push("high_abuse_tld");
  if (h.split(".").length > 5) f.push("deep_subdomain");
  if (u.protocol === "http:") f.push("no_tls");
  if (/@/.test(u.href.replace(/^https?:\/\//, "").split("/")[0])) f.push("at_sign_in_authority");
  if (u.href.length > 300) f.push("very_long_url");
  return f;
}
