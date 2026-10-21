// Upstash Redis REST (Vercel KV-compatible env names). Falls back to in-memory if not configured.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const storeConfigured = !!(URL_ && TOKEN) || process.env.LOCAL_DEV_MEM_STORE === "1";
const remote = !!(URL_ && TOKEN);
const mem = new Map<string, { v: string; exp?: number }>();

async function cmd(...args: (string | number)[]): Promise<any> {
  if (!remote) return memCmd(args.map(String));
  const r = await fetch(URL_!, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(3000) });
  const j: any = await r.json(); if (j.error) throw new Error(j.error); return j.result;
}
function memCmd([c, k, a]: string[]): any {
  const e = mem.get(k); const live = e && (!e.exp || e.exp > Date.now()) ? e : undefined;
  switch (c.toUpperCase()) {
    case "GET": return live?.v ?? null;
    case "SET": mem.set(k, { v: a }); return "OK";
    case "SETNX": if (live) return 0; mem.set(k, { v: a }); return 1;
    case "INCRBY": { const v = Number(live?.v || 0) + Number(a); mem.set(k, { v: String(v), exp: live?.exp }); return v; }
    case "EXPIRE": if (live) live.exp = Date.now() + Number(a) * 1000; return 1;
  }
}
export const kv = {
  get: (k: string) => cmd("GET", k) as Promise<string | null>,
  set: (k: string, v: string) => cmd("SET", k, v),
  setnx: (k: string, v: string) => cmd("SETNX", k, v) as Promise<number>,
  incrby: (k: string, n: number) => cmd("INCRBY", k, n).then(Number),
  expire: (k: string, s: number) => cmd("EXPIRE", k, s),
};
