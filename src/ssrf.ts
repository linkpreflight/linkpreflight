import { lookup } from "node:dns/promises";
import net from "node:net";

export class BlockedError extends Error { code = "BLOCKED_TARGET"; }

function v4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19) && process.env.LOCAL_DEV_ALLOW_198_18 !== "1") || a >= 224;
}
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return v4Private(ip);
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return isPrivateIp(x.slice(7));
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("ff");
}

/** Validate a URL is http(s), standard-ish, and resolves only to public IPs. Returns resolved IPs. */
export async function assertPublicUrl(u: URL): Promise<string[]> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedError(`scheme ${u.protocol} not allowed`);
  if (u.username || u.password) throw new BlockedError("credentials in URL not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw new BlockedError("internal hostname");
  let ips: string[];
  if (net.isIP(host)) ips = [host];
  else {
    const res = await lookup(host, { all: true, verbatim: true });
    ips = res.map(r => r.address);
  }
  if (!ips.length) throw new BlockedError("no addresses");
  const bad = ips.find(isPrivateIp);
  if (bad) throw new BlockedError(`resolves to non-public address ${bad}`);
  return ips;
}
