import { assertPublicUrl, BlockedError } from "./ssrf.js";
import { checkFeeds, heuristics } from "./feeds.js";

const UA = "LinkPreflight/0.1 (+https://linkpreflight.dev)";
const HOP_TIMEOUT = 6000, MAX_HOPS = 10, SNIFF_BYTES = 65536;
const PARKED = [/domain (name )?(is|may be) for sale/i, /buy this domain/i, /this domain is parked/i, /sedoparking|parkingcrew|bodis\.com|above\.com\/marketplace|afternic|hugedomains|dan\.com|undeveloped\.com|parklogic/i, /domain has expired/i, /is available for purchase/i];

export interface Hop { url: string; status: number; location?: string }
export interface PreflightResult {
  input: string; ok: boolean; verdict: "ok" | "dead" | "parked" | "unsafe" | "blocked" | "error";
  status: number | null; final_url: string | null; redirects: Hop[]; redirect_count: number;
  content_type: string | null; content_length: number | null;
  dead: boolean; dead_reason: string | null; parked: boolean; parked_signals: string[];
  llms_txt: { exists: boolean; url: string | null; status: number | null };
  safety: { listed: boolean; matches: string[]; heuristic_flags: string[]; feeds_checked: boolean; sources: string[] };
  elapsed_ms: number; checked_at: string; error?: string;
}

async function hop(url: URL, method: "HEAD" | "GET") {
  await assertPublicUrl(url);
  return fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(HOP_TIMEOUT), headers: { "user-agent": UA, accept: "*/*" } });
}

async function readSome(r: Response): Promise<string> {
  if (!r.body) return "";
  const reader = r.body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
  try { while (n < SNIFF_BYTES) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; } }
  finally { reader.cancel().catch(() => {}); }
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, SNIFF_BYTES));
}

function errReason(e: any): string {
  const c = e?.cause?.code || e?.code || e?.name;
  if (["ENOTFOUND","EAI_AGAIN","EBUSY","ENODATA","EAI_NONAME","EAI_FAIL","ESERVFAIL","ENOTIMP","EREFUSED"].includes(c)) return "dns_not_found";
  if (c === "ECONNREFUSED") return "connection_refused";
  if (c === "TimeoutError" || e?.code === 23 || c === "UND_ERR_CONNECT_TIMEOUT" || c === "ETIMEDOUT") return "timeout";
  if (String(c).includes("CERT") || String(e?.cause?.message || "").includes("certificate")) return "tls_error";
  return String(c || "fetch_failed").toLowerCase();
}

export async function preflight(input: string): Promise<PreflightResult> {
  const t0 = Date.now();
  const base: PreflightResult = { input, ok: false, verdict: "error", status: null, final_url: null, redirects: [], redirect_count: 0, content_type: null, content_length: null, dead: false, dead_reason: null, parked: false, parked_signals: [], llms_txt: { exists: false, url: null, status: null }, safety: { listed: false, matches: [], heuristic_flags: [], feeds_checked: false, sources: [] }, elapsed_ms: 0, checked_at: new Date().toISOString() };
  const done = (r: PreflightResult) => ({ ...r, elapsed_ms: Date.now() - t0 });
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`); } catch { return done({ ...base, error: "invalid_url" }); }
  base.safety.heuristic_flags = heuristics(url);

  let cur = url, res: Response | null = null, method: "HEAD" | "GET" = "HEAD";
  try {
    for (let i = 0; i <= MAX_HOPS; i++) {
      try { res = await hop(cur, method); }
      catch (e: any) {
        if (method !== "HEAD" || e instanceof BlockedError || errReason(e) === "dns_not_found") throw e;
        method = "GET"; res = await hop(cur, "GET"); // some servers hang or reset on HEAD
      }
      if (method === "HEAD" && [400, 403, 405, 501].includes(res.status) && i === base.redirects.length) { method = "GET"; res.body?.cancel(); res = await hop(cur, "GET"); }
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        base.redirects.push({ url: cur.href, status: res.status, location: loc });
        res.body?.cancel().catch(() => {});
        if (i === MAX_HOPS) return done({ ...base, verdict: "error", error: "too_many_redirects" });
        cur = new URL(loc, cur);
        if (cur.protocol !== "http:" && cur.protocol !== "https:") return done({ ...base, verdict: "blocked", error: `redirect to ${cur.protocol}` });
        continue;
      }
      break;
    }
  } catch (e: any) {
    if (e instanceof BlockedError) return done({ ...base, verdict: "blocked", error: e.message });
    const reason = errReason(e);
    const r = { ...base, final_url: cur.href, redirect_count: base.redirects.length, dead: true, dead_reason: reason, verdict: "dead" as const, error: reason };
    const feeds = await checkFeeds([url.href, cur.href]);
    r.safety = { ...r.safety, listed: feeds.listed, matches: feeds.matches, feeds_checked: feeds.checked, sources: feeds.sources };
    return done(r);
  }
  const r = res!;
  const out: PreflightResult = { ...base, status: r.status, final_url: cur.href, redirect_count: base.redirects.length,
    content_type: r.headers.get("content-type"), content_length: r.headers.get("content-length") ? Number(r.headers.get("content-length")) : null };
  if (cur.href !== url.href) out.safety.heuristic_flags = [...new Set([...out.safety.heuristic_flags, ...heuristics(cur).map(f => `final:${f}`)])];

  // parked sniff: only small GET of HTML on the final URL
  const [feeds, sniff, llms] = await Promise.all([
    checkFeeds([url.href, cur.href, ...base.redirects.map(h => h.url)]),
    (async () => {
      if (r.status >= 400) return "";
      if (method === "GET" && (out.content_type || "").includes("html")) return readSome(r);
      r.body?.cancel().catch(() => {});
      if (out.content_type && !out.content_type.includes("html")) return "";
      try { const g = await hop(cur, "GET"); return g.status < 300 ? readSome(g) : (g.body?.cancel(), ""); } catch { return ""; }
    })(),
    (async () => {
      const lu = new URL("/llms.txt", cur.origin);
      try { const g = await hop(lu, "GET"); const ct = g.headers.get("content-type") || ""; const body = g.status === 200 ? await readSome(g) : (g.body?.cancel(), "");
        const exists = g.status === 200 && !ct.includes("html") && !/^\s*</.test(body) && body.trim().length > 0;
        return { exists, url: exists ? lu.href : null, status: g.status };
      } catch { return { exists: false, url: null, status: null }; }
    })(),
  ]);
  out.llms_txt = llms;
  out.safety = { ...out.safety, listed: feeds.listed, matches: feeds.matches, feeds_checked: feeds.checked, sources: feeds.sources };
  out.parked_signals = PARKED.filter(p => p.test(sniff)).map(p => p.source.slice(0, 40));
  out.parked = out.parked_signals.length > 0;
  if (r.status === 404 || r.status === 410) { out.dead = true; out.dead_reason = `http_${r.status}`; }
  else if (r.status >= 500) { out.dead = true; out.dead_reason = `http_${r.status}`; }
  out.verdict = out.safety.listed ? "unsafe" : out.dead ? "dead" : out.parked ? "parked" : "ok";
  out.ok = out.verdict === "ok";
  return done(out);
}
