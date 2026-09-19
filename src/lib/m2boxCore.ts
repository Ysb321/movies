/* M2Box (m2box.org, the MovieBox web build) core helpers — shared by the
 * /api/m2box/stream route. Extracted from the route so the pure pieces are
 * unit-testable and the route file exports only HTTP handlers (a Next.js
 * route.ts requirement).
 *
 * How m2box plays video (reverse-engineered from their Nuxt bundle):
 *  - Every fetch goes to the SITE ORIGIN (m2box.org) which proxies the
 *    MovieBox BFF under /wefeed-h5api-bff/* — calling h5-api.aoneroom.com
 *    directly works for detail but play returns empty without the right
 *    headers, so everything goes through m2box.org with browser headers.
 *  - GET /wefeed-h5api-bff/detail?detailPath={slug} -> subject metadata
 *    + resource.seasons[] (se/maxEp per season, resolutions).
 *  - GET /wefeed-h5api-bff/subject/play?subjectId={id}&se={s}&ep={e}
 *    &detailPath={slug} -> streams[] (progressive MP4) or hls[] rows:
 *    { url, resolutions, size, duration, format, codecName }.
 *    CRITICAL: this endpoint needs a browser UA + a Referer on the
 *    title's own page (https://m2box.org/movies/{slug}) or it returns
 *    hasResource:false with an empty list.
 *  - Streams are direct signed CDN mp4s (bcdnxw.hakunaymatata.com), so rows
 *    play inline or hand off to VLC like every other lane.
 *
 * Title matching: m2box exposes NO keyword search to anonymous callers
 * (subject/search requires a session token), so we build a title index from
 * their public sitemaps (~355k movie slugs on the sibling themoviebox.org)
 * plus the paginated SSR TV/anime list pages and the home/trending
 * catalogs, then match the TMDB title against detailPath slugs (normalized)
 * with year verification from the detail payload's releaseDate. */
import { createHash } from "crypto";

export const SITE = "https://m2box.org";
/* their sibling web build hosts the public title sitemaps (referenced by
 * m2box's own sitemap.xml redirect): 71 sub-sitemaps x 5000 urls of
 * moviesDetail/{slug} rows covering the whole catalog. This is the only
 * full index available anonymously (subject/search needs a session). */
const SITEMAP_HOST = "https://themoviebox.org";
const SITEMAP_INDEX = `${SITEMAP_HOST}/sitemap_index_themoviebox.org_movies_detail.xml`;
export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/* anonymous client token: "<unixSeconds>,<md5(reversed-seconds-string)>" -
 * ported verbatim from their bundle (hx/Cx in B410pHzd.js). detail and the
 * catalogs work without it; sending it keeps every call uniform. */
export function clientToken(): string {
  const ts = Math.floor(Date.now() / 1000).toString();
  const md5 = createHash("md5").update(ts.split("").reverse().join("")).digest("hex");
  return `${ts},${md5}`;
}

export function m2boxHeaders(detailPath?: string): Record<string, string> {
  return {
    accept: "application/json, */*",
    "user-agent": UA,
    "accept-language": "en-US,en;q=0.9",
    "x-client-token": clientToken(),
    "x-request-lang": "en",
    "x-client-info": JSON.stringify({ timezone: "Asia/Kolkata" }),
    ...(detailPath ? { referer: `${SITE}/movies/${detailPath}` } : {}),
  };
}

/* one resilient fetch (2 attempts, 429/5xx backoff) -> raw text; JSON and
 * XML consumers parse separately (sitemaps are XML) */
export async function fetchText(url: string, headers: Record<string, string>, timeoutMs = 12000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429 || res.status >= 500) {
        await res.body?.cancel().catch(() => {});
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        return null;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      return await res.text();
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

export async function fetchJson(url: string, headers: Record<string, string>, timeoutMs = 12000) {
  const text = await fetchText(url, headers, timeoutMs);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ── title index (full catalog via the public sitemaps) ────────────── */

/* slug -> parsed title words (built lazily, then cached process-wide:
 * all 71 sub-sitemaps (~355k rows) are loaded once in batches; the catalog
 * barely changes between deploys. Slugs like "inception-russian-40v6bCfWC6"
 * end with a random 8-12 char token; language markers (russian/hindi...)
 * stay part of the title text. */
const SUFFIX = /-[a-zA-Z0-9]{8,12}$/;
export const slugIndex = new Map<string, string>(); // slug -> normalized title words
let indexPromise: Promise<void> | null = null;

/* TV + anime have no sitemap; the site's SSR list pages carry /detail/{slug}
 * links and DO paginate (?page=N, ~15 pages each). Crawled alongside the
 * movie sitemaps into the same slug index. */
const LIST_PAGES = ["/web/tv-series", "/web/animated-series"];
const LIST_PAGES_DEPTH = 16;
const DETAIL_HREF = /\/detail\/([a-z0-9-]+-[a-zA-Z0-9]{8,12})/g;

export function loadSitemapIndex(diag: string[]): Promise<void> {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const h = m2boxHeaders();
    const idx = await fetchText(SITEMAP_INDEX, h);
    const subs = (idx ? idx.match(/<loc>([^<]+)<\/loc>/g) : null) || [];
    if (!subs.length) {
      diag.push("sitemap:index-fail");
      return;
    }
    /* all subs, 10 concurrent: ~355k rows land in ~10-15s once per process,
     * then every request is a local map scan */
    const picked = subs.map((l) => l.replace(/<\/?loc>/g, ""));
    const re = /<loc>([^<]+)<\/loc>/g;
    for (let i = 0; i < picked.length; i += 10) {
      const batch = picked.slice(i, i + 10);
      const parts = await Promise.all(
        batch.map(async (u) => {
          const xml = await fetchText(u, h, 20000);
          return xml || "";
        })
      );
      for (const xml of parts) {
        for (const m of xml.matchAll(re)) {
          const slug = m[1].split("/").pop() || "";
          if (!slug || slugIndex.has(slug)) continue;
          slugIndex.set(slug, words(slug.replace(SUFFIX, "").replace(/-/g, " ")));
        }
      }
    }
    diag.push(`sitemap:${slugIndex.size}`);

    /* home + trending catalogs: only ~400 rows but they carry the currently
     * featured TV/anime (which the movie sitemaps lack) */
    const take = (list: any[]) => {
      for (const item of list || []) {
        const s = item?.subject || item;
        const path = s?.detailPath || s?.detailPathName;
        if (!path || slugIndex.has(path)) continue;
        slugIndex.set(path, words(path.replace(SUFFIX, "").replace(/-/g, " ")));
      }
    };
    const home = await fetchJson(`${SITE}/wefeed-h5api-bff/home?host=m2box.org`, h);
    if (home?.code === 0) {
      for (const section of home?.data?.operatingList || []) {
        if (Array.isArray(section?.subjects)) take(section.subjects);
        if (Array.isArray(section?.banner?.items)) take(section.banner.items);
      }
    }
    const trend = await fetchJson(
      `${SITE}/wefeed-h5api-bff/subject/trending?page=1&perPage=36`,
      h
    );
    if (trend?.code === 0) take(trend?.data?.items || trend?.data?.subjects || []);

    /* TV + anime list pages (paginated SSR) into the same index */
    const addSlugs = (html: string) => {
      for (const m of html.matchAll(DETAIL_HREF)) {
        const slug = m[1];
        if (!slugIndex.has(slug))
          slugIndex.set(slug, words(slug.replace(SUFFIX, "").replace(/-/g, " ")));
      }
    };
    for (const base of LIST_PAGES) {
      for (let i = 0; i < LIST_PAGES_DEPTH; i += 4) {
        const pages = await Promise.all(
          [0, 1, 2, 3].map(async (k) => {
            const p = i + k + 1;
            const html = await fetchText(`${SITE}${base}?page=${p}`, h, 15000);
            return html || "";
          })
        );
        const before = slugIndex.size;
        for (const html of pages) addSlugs(html);
        if (slugIndex.size === before) break; // past the last page
      }
    }
    diag.push(`total:${slugIndex.size}`);
  })().catch(() => {
    indexPromise = null; // allow a retry on the next request
    diag.push("sitemap:error");
  });
  return indexPromise;
}

export const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ") // strip [Hindi][CAM] tags
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const words = (s: string) => norm(s).split(" ").filter(Boolean).slice(0, 8).join(" ");

/* slug-index matching: slug-title words vs the requested title (raw then
 * original). Exact-normalized equality always wins; otherwise the longest
 * containment hit. Year can't be checked pre-detail (slugs carry no date)
 * so it's verified after. */
export function matchSlugs(target: string, orig: string, limit = 4): string[] {
  const t = target && words(target);
  const o = orig && words(orig);
  if (!t && !o) return [];
  const scored: { slug: string; tier: number; dist: number }[] = [];
  const tLen = (t || "").length;
  for (const [slug, sWords] of slugIndex) {
    if ((t && sWords === t) || (o && sWords === o)) {
      /* exact: tier 0, but keep walking so dead exact slugs can fall
       * through to near candidates */
      scored.push({ slug, tier: 0, dist: 0 });
      continue;
    }
    let tier = 0;
    if (t && (sWords.includes(t) || t.includes(sWords))) tier = 1;
    else if (o && (sWords.includes(o) || o.includes(sWords))) tier = 1;
    if (!tier) continue;
    /* closest length wins: "inception russian" beats
     * "inception version francaise" for "inception" */
    scored.push({ slug, tier, dist: Math.abs(sWords.length - tLen) });
  }
  scored.sort((a, b) => a.tier - b.tier || a.dist - b.dist);
  const out = scored.slice(0, limit).map((x) => x.slug);
  return out;
}

/* verify a detail subject against the requested title (+year ±1) */
export function verifySubject(s: any, title: string, origTitle: string, year: string): boolean {
  const realWords = words(s?.title || "");
  const want = words(title);
  const wantO = origTitle ? words(origTitle) : "";
  const titleOk =
    (realWords && want && (realWords === want || realWords.includes(want) || want.includes(realWords))) ||
    (realWords && wantO && (realWords === wantO || realWords.includes(wantO) || wantO.includes(realWords)));
  if (!titleOk) return false;
  if (year) {
    const ry = Number(String(s?.releaseDate || "").slice(0, 4));
    if (ry && Math.abs(ry - Number(year)) > 1) return false;
  }
  return true;
}

/* ── stream mapping ─────────────────────────────────────────────────── */

const fmtSize = (bytes: number | string | undefined) => {
  const b = Number(bytes || 0);
  if (b > 0) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  return "";
};

export function toRows(streams: any[], hls: any[], source: string) {
  const rows: { name: string; description: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const s of [...streams, ...hls]) {
    if (!s?.url || typeof s.url !== "string") continue;
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    const res = s.resolutions && s.resolutions !== "0" ? `${s.resolutions}p` : "";
    const size = fmtSize(s.size);
    const format = s.format || (hls.length && !streams.length ? "HLS" : "MP4");
    rows.push({
      name: `M2Box ${res || format}`.trim(),
      description: `[M2Box]${size ? ` 💾 ${size}` : ""}${res ? ` ${res}` : ""} ${format}${source ? ` · ${source}` : ""}`,
      url: s.url,
    });
  }
  return rows;
}
