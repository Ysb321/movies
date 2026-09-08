/* CloudStream-port engine: search every provider in parallel, match
 * the TMDB title/year strictly, then resolve host pages to DIRECT
 * links. One provider dying never affects the others. */
import { CS_PROVIDERS, CsProvider } from "./providers";
import { resolveHostLink } from "./extractors";
import { rawGet, Budget, BudgetError, csxUrls } from "./http";

export type CsChip = {
  provider: string; // vegamovies, hdhub4u...
  server: string; // FSL / Mega / PixelDrain / 10Gbps / Direct...
  link: string; // DIRECT url for VLC
  quality: string; // "1080p"
  size: string; // "2.6GB"
  title: string; // matched post title (language parsing)
};

export type CsDebug = {
  provider: string;
  posts: number;
  titles: string[];
  matched: string | null;
  links: number;
  linkSamples: string[];
  chips: number;
  err: string | null;
  budget?: boolean;
};

export type CsMeta = { title: string; year: number; imdbId?: string };
export type CsOpts = { maxFetches?: number };

/* ---- strict title matching (wrong-movie links unacceptable) ---- */
const norm = (x: string) => (x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function postMatches(title: string, wantTitle: string, year: number): boolean {
  const t = norm(String(title || "").replace(/^download\s+/i, ""));
  const want = norm(wantTitle);
  if (!t || !want) return false;
  const years = (String(title).match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
  const yearOk = (exact: boolean) =>
    !year || !years.length || years.some((y) => (exact ? y === year : Math.abs(y - year) <= 1));
  if (t.startsWith(want) && yearOk(false)) return true;
  const tokens = want.split(" ").filter((w) => w.length > 3);
  if (!tokens.length || !years.length) return false;
  return tokens.every((tk) => t.includes(tk)) && yearOk(true);
}

const QUALITY_RANK = (q: string) =>
  /2160|4k/i.test(q) ? 4 : /1080/i.test(q) ? 3 : /720/i.test(q) ? 2 : /480/i.test(q) ? 1 : 0;

export async function listAll(
  meta: CsMeta,
  type: "movie" | "tv",
  season?: number,
  episode?: number,
  only?: string[],
  dbg?: CsDebug[],
  opts?: CsOpts
): Promise<CsChip[]> {
  const budget: Budget = { left: opts?.maxFetches ?? 2000 };
  const mods: CsProvider[] = only
    ? CS_PROVIDERS.filter((p) => only.includes(p.value))
    : CS_PROVIDERS;

  const jobs = mods.map(async (m): Promise<CsChip[]> => {
    const d: CsDebug = { provider: m.value, posts: 0, titles: [], matched: null, links: 0, linkSamples: [], chips: 0, err: null };
    dbg?.push(d);
    try {
      const posts = await m.search(meta.title, budget, { year: meta.year, imdbId: meta.imdbId });
      const clean = (posts ?? []).filter((p) => p?.link && p?.title);
      d.posts = clean.length;
      d.titles = clean.slice(0, 6).map((p) => String(p.title).slice(0, 60));
      /* imdb-id match first (bulletproof), then strict title+year */
      const hit =
        clean.find((p) => p.imdbId && meta.imdbId && p.imdbId === meta.imdbId) ??
        clean.find((p) => postMatches(p.title, meta.title, meta.year));
      d.matched = hit?.title ?? null;
      if (!hit) return [];

      const hostLinks = await m.hostLinks(
        hit,
        { type, season: season ?? 1, episode: episode ?? 1 },
        budget
      );
      d.links = hostLinks.length;
      d.linkSamples = hostLinks.slice(0, 3).map((l) => l.replace(/^https?:\/\//, "").slice(0, 70));
      if (!hostLinks.length) {
        d.err = "no host links";
        return [];
      }

      const chips: CsChip[] = [];
      const linkErrs: string[] = [];
      /* hubcloud entries cost 2+ proxied fetches each (rate-limited) -
       * try 2 of them; gdflix/others are cheap, try 4 */
      const isHub = (u: string) => /hubcloud/i.test(u);
      const ordered = [
        ...hostLinks.filter((u) => !isHub(u)).slice(0, 4),
        ...hostLinks.filter(isHub).slice(0, 2),
      ];
      for (const hl of ordered.slice(0, 5)) {
        if (budget.left <= 3) break;
        let resolved;
        try {
          resolved = await resolveHostLink(hl, budget);
        } catch (e: any) {
          linkErrs.push(`${hl.replace(/^https?:\/\//, "").slice(0, 40)}: ${String(e?.message ?? e).slice(0, 60)}`);
          continue;
        }
        for (const r of resolved) {
          chips.push({
            provider: m.value,
            server: r.server,
            link: r.link,
            quality: r.quality,
            size: r.size,
            title: hit.title,
          });
        }
        if (chips.length >= 10) break;
      }
      d.chips = chips.length;
      if (!chips.length && linkErrs.length) d.err = linkErrs.join(" | ").slice(0, 140);
      return chips;
    } catch (e: any) {
      if (e instanceof BudgetError || e?.__budget) d.budget = true;
      d.err = String(e?.message ?? e).slice(0, 140);
      return [];
    }
  });

  const all = (await Promise.all(jobs)).flat();

  /* dedupe by link, keep best quality first per provider */
  const seen = new Set<string>();
  const out: CsChip[] = [];
  for (const c of all) {
    if (seen.has(c.link)) continue;
    seen.add(c.link);
    out.push(c);
  }
  return out
    .sort((a, b) => QUALITY_RANK(b.quality) - QUALITY_RANK(a.quality) || a.provider.localeCompare(b.provider))
    .slice(0, 60);
}

export const CS_PROVIDER_VALUES = CS_PROVIDERS.map((p) => p.value);
export const CS_PROVIDER_COUNT = CS_PROVIDERS.length;

/* re-exported so the API route can warm the domain map */
export { csxUrls };
