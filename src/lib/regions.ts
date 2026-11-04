import type { RegionInfo } from "../bindings/RegionInfo";
import type { RegionResult } from "../bindings/RegionResult";

/**
 * Valve pop codes are IATA-style city codes, sometimes with a carrier
 * suffix (e.g. `sham`, `ctum`). Only the three-letter stem is mapped.
 */
const COUNTRY: Record<string, string> = {
  ams: "NL", atl: "US", bom: "IN", maa: "IN", del: "IN", can: "CN", ctu: "CN", sha: "CN", tsn: "CN", pek: "CN",
  pwg: "CN", pwj: "CN", pwu: "CN", pww: "CN", pwz: "CN", dfw: "US", eat: "US", iad: "US", lax: "US", ord: "US",
  sea: "US", okc: "US", mia: "US", sjc: "US", dxb: "AE", fra: "DE", fsn: "DE", gru: "BR", hel: "FI", hkg: "HK",
  jnb: "ZA", lhr: "GB", lim: "PE", lux: "LU", mad: "ES", par: "FR", scl: "CL", sgp: "SG", sto: "SE",
  syd: "AU", tyo: "JP", vie: "AT", waw: "PL", eze: "AR", bog: "CO", seo: "KR", icn: "KR", mnl: "PH",
  jed: "SA", ruh: "SA", ist: "TR", mil: "IT", mxp: "IT", prg: "CZ", buh: "RO", sof: "BG", kix: "JP", osa: "JP",
  bne: "AU", mel: "AU", per: "AU", akl: "NZ", tpe: "TW", bkk: "TH", kul: "MY", cgk: "ID", cai: "EG",
  lbg: "FR", dub: "IE", cph: "DK", osl: "NO", zrh: "CH", mex: "MX", yyz: "CA", ymq: "CA", yvr: "CA",
};

export function countryOf(code: string): string | null {
  return COUNTRY[code.slice(0, 3).toLowerCase()] ?? null;
}

export function avgOf(r: RegionResult | undefined): number | null {
  return r?.stats?.avg ?? null;
}

export function isClean(r: RegionResult | undefined): boolean {
  if (!r?.stats || r.stats.avg == null) return false;
  return r.stats.lossPct === 0 && (r.grade === "Excellent" || r.grade === "Good");
}

/** Rank by what a player feels: latency, with jitter and loss as penalties. */
export function playScore(r: RegionResult): number {
  const s = r.stats;
  if (!s || s.avg == null) return Number.POSITIVE_INFINITY;
  return s.avg + 2 * (s.jitter ?? 0) + 8 * s.lossPct;
}

export function bestRegion(results: RegionResult[], opts: { excludeBlocked?: boolean } = {}): RegionResult | undefined {
  const pool = results.filter((r) => r.stats?.avg != null && !(opts.excludeBlocked && r.block.state === "blocked"));
  return pool.reduce<RegionResult | undefined>((best, r) => (!best || playScore(r) < playScore(best) ? r : best), undefined);
}

export type SortKey = "avg" | "min" | "p95" | "max" | "jitter" | "loss" | "city";

export function sortRegions(
  infos: RegionInfo[],
  results: Record<string, RegionResult>,
  key: SortKey,
): RegionInfo[] {
  const value = (code: string): number => {
    const s = results[code]?.stats;
    if (!s) return Number.POSITIVE_INFINITY;
    const v = key === "loss" ? s.lossPct : key === "city" ? 0 : s[key];
    return v ?? Number.POSITIVE_INFINITY;
  };
  return [...infos].sort((a, b) => {
    if (key === "city") return a.city.localeCompare(b.city);
    const va = value(a.code);
    const vb = value(b.code);
    if (va === vb) return a.city.localeCompare(b.city);
    if (!Number.isFinite(va)) return 1;
    if (!Number.isFinite(vb)) return -1;
    return va - vb;
  });
}
