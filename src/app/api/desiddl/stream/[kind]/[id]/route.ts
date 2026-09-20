import { NextRequest, NextResponse } from "next/server";

/* Server 11 (DesiDDL) stream API - Hindi DDL blogs NOT covered by Server 9
 * (WebStreamrMBG only scrapes 4KHDHub/HDHub4u for Hindi): VegaMovies +
 * MoviesDrive (ported from the Megix CSX CloudStream providers, then
 * re-verified live 2026-09-09 - both blogs changed templates) + HDMovie2
 * (newhdmovie2.best posts -> hdm.im download pages -> GDFlix).
 * Live shape now: Typesense JSON search.php -> IMDb-verified hit (year in
 * title is REQUIRED when we know the year, so a 2023 namesake can never
 * win for a 1999 title) -> post page -> per-quality sections:
 *  VegaMovies movies: h5 "Title 480p BluRay [400MB]" + nexdrive.fit/genxfm
 *   Download Now link -> nexdrive page lists G-Direct (fastdl) + V-Cloud
 *   (+ Filepress/DropGalaxy, skipped: JS flows).
 *  VegaMovies series: h3 "Season S (Episode range) 480p ..." + nexdrive
 *   links (G-Direct / V-Cloud / V-Drive per quality) -> nexdrive page has
 *   "-:Episodes: N:-" h4 sections each with V-Cloud/Filepress links.
 *  MoviesDrive movies+series: h5 quality headings + h5 links which are
 *   DIRECT HubCloud (/drive/search-recover.php) rows already; legacy
 *   same-blog button pages are still fetched + scanned as a fallback.
 * Hubs stay unresolved here (fast list); taps open them embedded via
 * /api/desiddl/embed - the user clicks the hub's own Download / FSL /
 * Generate buttons and the file auto-plays in the site player (server
 * cracking in /api/desiddl/resolve is kept but unused - live bot-walls
 * beat it). Live domains refresh from Megix Utils urls.json (4h TTL).
 */

export const runtime = "edge";

const URLS_JSON =
  "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json";
const FALLBACK: Record<string, string> = {
  vegamovies: "https://new2.vegamovies.futbol",
  moviesdrive: "https://new3.moviesdrive.christmas",
  hdmovie2: "https://newhdmovie2.best",
};
const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/json,*/*",
};
const NEX = /(nexdrive|\/genxfm)/i;
const HUBREF = /(fastdl|vcloud|hubcloud|gdflix|gdlink)/i;

let urlCache: { at: number; map: Record<string, string> } = { at: 0, map: {} };
async function blogBase(key: string): Promise<string> {
  const now = Date.now();
  if (!urlCache.at || now - urlCache.at > 4 * 3600 * 1000) {
    try {
      const r = await fetch(URLS_JSON, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j && typeof j === "object") urlCache = { at: now, map: j };
    } catch {
      urlCache = { at: now, map: urlCache.map };
    }
  }
  return (urlCache.map[key] || FALLBACK[key]).replace(/\/$/, "");
}

const strip = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const abs = (href: string, base: string) =>
  /^https?:\/\//i.test(href)
    ? href
    : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
const lookback = (post: string, idx: number, n = 900) =>
  strip(post.slice(Math.max(0, idx - n), idx));

type Anchor = { href: string; text: string; inner: string };
function anchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1];
    const href =
      /href\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ||
      /href\s*=\s*'([^']+)'/i.exec(attrs)?.[1] ||
      "";
    out.push({ href, text: strip(m[2]), inner: m[2] });
  }
  return out;
}

/* hub anchors with source positions (for episode segmentation) */
type HubAnchor = { href: string; text: string; pos: number };
function hubAnchors(html: string): HubAnchor[] {
  const out: HubAnchor[] = [];
  const push = (href: string, text: string, pos: number) => {
    if (href && HUBREF.test(href)) out.push({ href, text, pos });
  };
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    push(m[1], strip(m[2]), m.index || 0);
  }
  for (const m of html.matchAll(/<a\b[^>]*href='([^']+)'[^>]*>([\s\S]*?)<\/a>/gi)) {
    push(m[1], strip(m[2]), m.index || 0);
  }
  return out.sort((a, b) => a.pos - b.pos);
}

const parseQuality = (s: string) => {
  const m = s.match(/(\d{3,4})[pP]/);
  if (m) return `${m[1]}p`;
  if (/8k/i.test(s)) return "4320p";
  if (/4k/i.test(s)) return "2160p";
  return "Auto";
};
/* last quality/size mention nearby (headings precede their links) */
const qualityNear = (t: string) => {
  const ms = [...t.matchAll(/(\d{3,4})[pP]/g)];
  if (ms.length) return `${ms[ms.length - 1][1]}p`;
  if (/8k/i.test(t)) return "4320p";
  if (/4k/i.test(t)) return "2160p";
  return "Auto";
};
const sizeNear = (t: string) => {
  const ms = [...t.matchAll(/\[([^\]]*(?:MB|GB)[^\]]*)\]/gi)];
  return ms.length ? ms[ms.length - 1][1].trim() : "";
};
const sizeMap = (postTitle: string) => {
  const m = new Map<string, string>();
  for (const mm of postTitle.matchAll(/(\d{3,4}p)\s*\[([^\]]+)\]/gi))
    m.set(mm[1].toLowerCase(), mm[2]);
  return m;
};
const parseAudio = (t: string) => {
  const d = t.match(/dual audio\s*\{[^}]*\}/i) || t.match(/dual audio[^|\[]*/i);
  if (d) return d[0].trim().slice(0, 48);
  if (/hindi/i.test(t)) return "🇮🇳 Hindi";
  return "";
};
const seasonNum = (t: string) => {
  const m = /season\s*0*(\d{1,2})/i.exec(t) || /\bS0*(\d{1,2})E/i.exec(t);
  return m ? Number(m[1]) : 0;
};
const hubKind = (u: string) =>
  /fastdl/i.test(u)
    ? "gdirect"
    : /vcloud/i.test(u)
      ? "vcloud"
      : /hubcloud/i.test(u)
        ? "hubcloud"
        : /gdlink/i.test(u)
          ? "gdlink"
          : "gdflix";
const hubLabel = (u: string) =>
  /fastdl/i.test(u)
    ? "G-Direct"
    : /vcloud/i.test(u)
      ? "V-Cloud"
      : /hubcloud/i.test(u)
        ? "HubCloud"
        : /gdlink/i.test(u)
          ? "GDLink"
          : "GDFlix";

/* episode segmentation for multi-ep hub pages ("-:Episodes: N:-" h4s,
 * Ep01/E01 marks): no marks at all -> the whole page is one file. */
function segmentByEp<T extends { pos: number }>(html: string, items: T[], e: number): T[] {
  const marks: { pos: number; ep: number }[] = [];
  for (const em of html.matchAll(/episodes?\s*:?\s*0*(\d{1,3})/gi)) {
    marks.push({ pos: em.index || 0, ep: Number(em[1]) });
  }
  for (const em of html.matchAll(/\bEp0*(\d{1,3})\b/gi)) {
    marks.push({ pos: em.index || 0, ep: Number(em[1]) });
  }
  if (!marks.length) return items;
  const mine = marks.filter((x) => x.ep === e);
  if (!mine.length) return [];
  const from = Math.min(...mine.map((x) => x.pos));
  const after = marks.filter((x) => x.pos > from).map((x) => x.pos);
  const to = after.length ? Math.min(...after) : Infinity;
  return items.filter((x) => x.pos > from && x.pos < to);
}

type Row = {
  key: string;
  blog: string;
  quality: string;
  size: string;
  source: string;
  file: string;
  audio: string;
  hub: string;
  hubKind: string;
};

type Hit = { title: string; url: string; imdb: string };
async function searchBlog(base: string, title: string): Promise<Hit[]> {
  const r = await fetch(`${base}/search.php?q=${encodeURIComponent(title)}&page=1`, {
    headers: UA,
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json();
  const hits = Array.isArray(j.hits) ? j.hits : [];
  return hits.map((h: { document?: { post_title?: string; permalink?: string; imdb_id?: string } }) => ({
    title: h.document?.post_title || "",
    url: h.document?.permalink || "",
    imdb: h.document?.imdb_id || "",
  }));
}
const STOP = new Set(["the", "a", "an", "of", "and", "to", "in", "on", "vs"]);
function pickHit(hits: Hit[], title: string, year: string, imdb: string): Hit | null {
  if (imdb) {
    const m = hits.find((h) => h.imdb.toLowerCase() === imdb.toLowerCase());
    if (m && m.url) return m;
  }
  /* year known -> only titles carrying it (a 2023 namesake must never win
   * for a 1999 title); no dated hit -> no rows beats wrong rows. */
  const pool = year ? hits.filter((h) => h.title.includes(year)) : hits;
  if (!pool.length) return null;
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  let best: Hit | null = null;
  let bestScore = 0;
  for (const h of pool) {
    if (!h.url) continue;
    const t = h.title.toLowerCase();
    let s = 0;
    for (const w of words) if (t.includes(w)) s++;
    if (s > bestScore) {
      bestScore = s;
      best = h;
    }
  }
  /* every significant word must be present - partial matches are how
   * wrong movies slip in. */
  return best && bestScore >= words.length ? best : null;
}
/* the post page itself must agree (title tag carries the full post title
 * on all three blogs) - kills wrong-movie rows at the source. */
function verifyPost(html: string, title: string, year: string): boolean {
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return true;
  const tag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "";
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || "";
  const t = strip(`${tag} ${h1}`).toLowerCase();
  if (!t) return true;
  if (year && !t.includes(year)) return false;
  return words.every((w) => t.includes(w));
}
async function getHtml(url: string, ms: number): Promise<string> {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`page ${r.status}`);
  return r.text();
}

/* ── VegaMovies ── */
async function vegaMovie(base: string, post: string, postTitle: string): Promise<Row[]> {
  const sizes = sizeMap(postTitle);
  const audio = parseAudio(postTitle);
  const file = strip(postTitle).replace(/^Download\s+/i, "").slice(0, 90);
  const cands: { href: string; text: string; pos: number }[] = [];
  for (const m of post.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = abs(m[1], base);
    if (NEX.test(href)) {
      cands.push({ href, text: strip(m[2]), pos: m.index || 0 });
    } else if (href.startsWith(base) && /\/(button|buttons|download-button)|dwd/i.test(m[1])) {
      cands.push({ href, text: strip(m[2]), pos: m.index || 0 });
    }
  }
  const out: Row[] = [];
  await Promise.all(
    cands.slice(0, 8).map(async ({ href, text, pos }, i) => {
      try {
        const near = `${lookback(post, pos)} ${text}`;
        const q = qualityNear(near);
        if (q === "Auto") return;
        const size = sizeNear(near) || sizes.get(q.toLowerCase()) || "";
        const h = await getHtml(href, 12000);
        const seen = new Set<string>();
        for (const hb of hubAnchors(h)) {
          const kind = hubKind(hb.href);
          if (seen.has(kind)) continue;
          seen.add(kind);
          out.push({
            key: `vega-${q}-${i}-${kind}`,
            blog: "VegaMovies",
            quality: q,
            size,
            source: hubLabel(hb.href),
            file,
            audio,
            hub: abs(hb.href, base),
            hubKind: kind,
          });
        }
      } catch {
        /* one dead button must not kill the rest */
      }
    })
  );
  return out;
}
async function vegaSeries(
  base: string, post: string, postTitle: string, s: number, e: number
): Promise<Row[]> {
  const audio = parseAudio(postTitle);
  const file = strip(postTitle).replace(/^Download\s+/i, "").slice(0, 80);
  const heads = [...post.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  const sections: { text: string; start: number; end: number }[] = [];
  for (let i = 0; i < heads.length; i++) {
    const text = strip(heads[i][1]);
    if (!/4k|\d{3,4}p/i.test(text)) continue;
    sections.push({
      text,
      start: (heads[i].index || 0) + heads[i][0].length,
      end: i + 1 < heads.length ? heads[i + 1].index || post.length : post.length,
    });
  }
  const pools = sections.length
    ? sections
    : [{ text: postTitle, start: 0, end: post.length }];
  const out: Row[] = [];
  const jobs: Promise<void>[] = [];
  for (const sec of pools) {
    const season = seasonNum(sec.text) || seasonNum(postTitle);
    if (season !== 0 && season !== s) continue;
    const q = qualityNear(sec.text);
    const size = sizeNear(sec.text);
    const chunk = post.slice(sec.start, sec.end);
    const links = [...chunk.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => ({ href: abs(m[1], base), text: strip(m[2]) }))
      .filter((a) => NEX.test(a.href));
    const uniq = [...new Map(links.map((l) => [l.href, l])).values()].slice(0, 6);
    for (const l of uniq) {
      jobs.push(
        (async () => {
          try {
            const h = await getHtml(l.href, 12000);
            const mine = segmentByEp(h, hubAnchors(h), e);
            const seen = new Set<string>();
            for (const hb of mine) {
              const kind = hubKind(hb.href);
              if (seen.has(kind)) continue;
              seen.add(kind);
              out.push({
                key: `vega-${q}-s${s}e${e}-${kind}-${out.length}`,
                blog: "VegaMovies",
                quality: q === "Auto" ? parseQuality(l.text) : q,
                size,
                source: hubLabel(hb.href),
                file: `${file} E${e}`.slice(0, 90),
                audio,
                hub: abs(hb.href, base),
                hubKind: kind,
              });
            }
          } catch {
            /* skip */
          }
        })()
      );
    }
  }
  await Promise.all(jobs);
  return out;
}

/* ── MoviesDrive ── */
async function mdriveMovie(base: string, post: string, postTitle: string): Promise<Row[]> {
  const sizes = sizeMap(postTitle);
  const audio = parseAudio(postTitle);
  const file = strip(postTitle).replace(/^Download\s+/i, "").slice(0, 90);
  const out: Row[] = [];
  const jobs: Promise<void>[] = [];
  let i = 0;
  for (const m of post.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi)) {
    const inner = m[1];
    const idx = m.index || 0;
    for (const a of anchors(inner).filter((x) => x.href)) {
      const href = abs(a.href, base);
      const near = `${lookback(post, idx)} ${a.text}`;
      const q = qualityNear(near);
      if (q === "Auto") continue;
      if (/^https?:\/\//i.test(a.href) && HUBREF.test(href)) {
        /* direct hub link (current template) - no intermediate hop */
        out.push({
          key: `mdrive-${q}-${i++}`,
          blog: "MoviesDrive",
          quality: q,
          size: sizeNear(near) || sizes.get(q.toLowerCase()) || "",
          source: hubLabel(href),
          file,
          audio,
          hub: href,
          hubKind: hubKind(href),
        });
      } else if (href.startsWith(base)) {
        /* legacy same-blog button page -> fetch + scan */
        const myQ = q;
        const id = i++;
        jobs.push(
          (async () => {
            try {
              const h = await getHtml(href, 12000);
              const seen = new Set<string>();
              for (const hb of hubAnchors(h)) {
                const kind = hubKind(hb.href);
                if (seen.has(kind)) continue;
                seen.add(kind);
                out.push({
                  key: `mdrive-${myQ}-${id}-${kind}`,
                  blog: "MoviesDrive",
                  quality: myQ,
                  size: sizes.get(myQ.toLowerCase()) || "",
                  source: hubLabel(hb.href),
                  file,
                  audio,
                  hub: abs(hb.href, base),
                  hubKind: kind,
                });
              }
            } catch {
              /* skip */
            }
          })()
        );
      }
    }
  }
  await Promise.all(jobs);
  return out;
}
async function mdriveSeries(
  base: string, post: string, postTitle: string, s: number, e: number
): Promise<Row[]> {
  const audio = parseAudio(postTitle);
  const file = strip(postTitle).replace(/^Download\s+/i, "").slice(0, 80);
  const out: Row[] = [];
  const jobs: Promise<void>[] = [];
  let i = 0;
  for (const m of post.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi)) {
    const inner = m[1];
    const idx = m.index || 0;
    if (/zip/i.test(strip(inner))) continue;
    const ctx = `${lookback(post, idx, 350)} ${strip(inner)}`;
    const season = seasonNum(ctx) || seasonNum(postTitle);
    if (!(season === s || (season === 0 && s === 1))) continue;
    if (/episodes?\s*:?\s*\d|\bEp?\d{1,3}\b/i.test(ctx)) {
      const marks = [
        ...ctx.matchAll(/episodes?\s*:?\s*0*(\d{1,3})/gi),
        ...ctx.matchAll(/\bEp?0*(\d{1,3})\b/gi),
      ].map((x) => Number(x[1]));
      if (marks.length && !marks.includes(e)) continue;
    }
    for (const a of anchors(inner).filter((x) => x.href)) {
      const href = abs(a.href, base);
      const q = qualityNear(`${ctx} ${a.text}`);
      if (/^https?:\/\//i.test(a.href) && HUBREF.test(href)) {
        out.push({
          key: `mdrive-${q}-s${s}e${e}-${i++}`,
          blog: "MoviesDrive",
          quality: q,
          size: "",
          source: hubLabel(href),
          file: `${file} E${e}`.slice(0, 90),
          audio,
          hub: href,
          hubKind: hubKind(href),
        });
      } else if (href.startsWith(base)) {
        const myQ = q;
        const id = i++;
        jobs.push(
          (async () => {
            try {
              const h = await getHtml(href, 12000);
              const mine = segmentByEp(h, hubAnchors(h), e);
              const seen = new Set<string>();
              for (const hb of mine) {
                const kind = hubKind(hb.href);
                if (seen.has(kind)) continue;
                seen.add(kind);
                out.push({
                  key: `mdrive-${myQ}-s${s}e${e}-${id}-${kind}`,
                  blog: "MoviesDrive",
                  quality: myQ,
                  size: "",
                  source: hubLabel(hb.href),
                  file: `${file} E${e}`.slice(0, 90),
                  audio,
                  hub: abs(hb.href, base),
                  hubKind: kind,
                });
              }
            } catch {
              /* skip */
            }
          })()
        );
      }
    }
  }
  await Promise.all(jobs);
  return out;
}

/* ── HDMovie2 (newhdmovie2.best -> hdm.im -> GDFlix) ── */
async function searchHdmovie2(base: string, title: string): Promise<Hit[]> {
  const html = await getHtml(`${base}/?s=${encodeURIComponent(title)}`, 10000);
  const seen = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]*\/movie\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = abs(m[1], base);
    const text = strip(m[2]);
    if (!text) continue;
    const prev = seen.get(url);
    if (prev === undefined || text.length > prev.length) seen.set(url, text);
  }
  return [...seen].map(([url, t]) => ({ title: t, url, imdb: "" }));
}
async function hdmovie2Rows(
  base: string, postUrl: string, postTitle: string, series: boolean, s: number, e: number,
  qtitle: string, qyear: string
): Promise<Row[]> {
  const post = await getHtml(postUrl, 15000);
  if (!verifyPost(post, qtitle, qyear)) return [];
  const audio = parseAudio(postTitle);
  const links: { url: string; text: string }[] = [];
  for (const m of post.matchAll(/<a\b[^>]*href="(https?:\/\/hdm\.im\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    links.push({ url: m[1], text: strip(m[2]) });
  }
  const uniq = [...new Map(links.map((l) => [l.url, l])).values()];
  const parsed = uniq.map((l) => ({ l, m: /season-(\d+)-ep0*(\d+)/i.exec(l.url) }));
  const anyParsed = parsed.some((x) => x.m);
  const wanted = series
    ? parsed
        .filter((x) => (x.m ? Number(x.m[1]) === s && Number(x.m[2]) === e : !anyParsed))
        .map((x) => x.l)
    : uniq;
  const out: Row[] = [];
  await Promise.all(
    wanted.slice(0, 12).map(async (l, i) => {
      try {
        const h = await getHtml(l.url, 12000);
        const epTag = /season-\d+-(ep0*\d+(?:-bonus-episode)?)/i.exec(l.url)?.[1] || "";
        for (const a of anchors(h)) {
          if (!/gdflix/i.test(a.href)) continue;
          const qm = /(\d{3,4})[pP]\s*\[([^\]]+)\]\s*([\d.]+\s*[MG]B)?/i.exec(a.text);
          if (!qm) continue;
          out.push({
            key: `hdm2-${qm[1]}p-${i}-${out.length}`,
            blog: "HDMovie2",
            quality: `${qm[1]}p`,
            size: qm[3] || "",
            source: "GDFlix",
            file: `${strip(postTitle).slice(0, 70)}${epTag ? ` ${epTag.toUpperCase()}` : ""}`,
            audio,
            hub: abs(a.href, base),
            hubKind: "gdflix",
          });
        }
      } catch {
        /* skip */
      }
    })
  );
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if ((kind !== "movie" && kind !== "series") || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "forbidden", rows: [] }, { status: 403 });
  }
  const q = req.nextUrl.searchParams;
  const title = (q.get("title") || "").slice(0, 200);
  const year = (q.get("year") || "").slice(0, 4);
  const imdb = (q.get("imdb") || "").slice(0, 16);
  const s = Math.max(1, Number(q.get("s") || 1));
  const e = Math.max(1, Number(q.get("e") || 1));
  if (!title) return NextResponse.json({ error: "no title", rows: [] }, { status: 403 });
  const series = kind === "series";

  const runBlog = async (key: string): Promise<Row[]> => {
    try {
      const base = await blogBase(key);
      if (key === "hdmovie2") {
        const hits = await searchHdmovie2(base, title);
        const hit = pickHit(hits, title, year, imdb);
        if (!hit) return [];
        return hdmovie2Rows(base, hit.url, hit.title, series, s, e, title, year);
      }
      const hits = await searchBlog(base, title);
      const hit = pickHit(hits, title, year, imdb);
      if (!hit) return [];
      const post = await getHtml(abs(hit.url, base), 15000);
      if (!verifyPost(post, title, year)) return [];
      if (key === "vegamovies") {
        return series
          ? vegaSeries(base, post, hit.title, s, e)
          : vegaMovie(base, post, hit.title);
      }
      return series ? mdriveSeries(base, post, hit.title, s, e) : mdriveMovie(base, post, hit.title);
    } catch {
      return [];
    }
  };
  const [vega, mdrive, hdm2] = await Promise.all([
    runBlog("vegamovies"),
    runBlog("moviesdrive"),
    runBlog("hdmovie2"),
  ]);
  const rows = [...vega, ...mdrive, ...hdm2].slice(0, 30);
  return NextResponse.json({ title, rows }, { headers: { "cache-control": "no-store" } });
}
