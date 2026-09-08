import { NextRequest, NextResponse } from "next/server";

/* Server 20 (DesiDDL) stream API - Hindi DDL blogs NOT covered by Server 9
 * (WebStreamrMBG only scrapes 4KHDHub/HDHub4u for Hindi): VegaMovies +
 * MoviesDrive (ported from the Megix CSX CloudStream providers) +
 * HDMovie2 (newhdmovie2.best posts -> hdm.im download pages -> GDFlix)
 * (VegaMoviesProvider/MoviesDriveProvider, Kotlin -> edge TS). Flow per
 * blog: Typesense JSON search.php -> IMDb-verified hit (Vega hits carry
 * imdb_id; MoviesDrive falls back to title+year fuzzy) -> post page ->
 * quality sections -> V-Cloud/HubCloud/GDFlix/GDLink hub links. Hubs stay
 * unresolved here (fast list); taps crack them via /api/desiddl/resolve
 * (FSL fast links first). Live domains refresh from Megix Utils urls.json
 * (4h TTL per isolate). Verified live 2026-09-09: search.php returns Dual
 * Audio {Hindi-English} hits (Fight Club tt0137523 exact). Post-page
 * selectors follow the CSX code - live-verify after deploy.
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

const parseQuality = (s: string) => {
  const m = s.match(/(\d{3,4})[pP]/);
  if (m) return `${m[1]}p`;
  if (/8k/i.test(s)) return "4320p";
  if (/4k/i.test(s)) return "2160p";
  return "Auto";
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
const hubKind = (u: string) =>
  /vcloud/i.test(u) ? "vcloud" : /hubcloud/i.test(u) ? "hubcloud" : /gdlink/i.test(u) ? "gdlink" : "gdflix";
const hubLabel = (u: string) =>
  /vcloud/i.test(u)
    ? "V-Cloud"
    : /hubcloud/i.test(u)
      ? "HubCloud"
      : /gdlink/i.test(u)
        ? "GDLink"
        : "GDFlix";

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
function pickHit(hits: Hit[], title: string, year: string, imdb: string): Hit | null {
  if (imdb) {
    const m = hits.find((h) => h.imdb.toLowerCase() === imdb.toLowerCase());
    if (m && m.url) return m;
  }
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  for (const useYear of year ? [true, false] : [false]) {
    let best: Hit | null = null;
    let bestScore = 0;
    for (const h of hits) {
      if (!h.url) continue;
      const t = h.title.toLowerCase();
      if (useYear && !t.includes(year)) continue;
      let s = 0;
      for (const w of words) if (t.includes(w)) s++;
      if (s > bestScore) {
        bestScore = s;
        best = h;
      }
    }
    if (best && bestScore > 0) return best;
  }
  return null;
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
  const btns = anchors(post).filter((a) => a.href && a.inner.includes("dwd-button"));
  const out: Row[] = [];
  await Promise.all(
    btns.map(async (b, i) => {
      try {
        const h = await getHtml(abs(b.href, base), 12000);
        const v = anchors(h).find((a) => a.href && a.text.toLowerCase().includes("v-cloud"));
        if (!v) return;
        const q = parseQuality(b.text);
        out.push({
          key: `vega-${q}-${i}`,
          blog: "VegaMovies",
          quality: q,
          size: sizes.get(q.toLowerCase()) || "",
          source: "V-Cloud",
          file: strip(postTitle).replace(/^Download\s+/i, "").slice(0, 90),
          audio,
          hub: abs(v.href, base),
          hubKind: "vcloud",
        });
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
  const out: Row[] = [];
  const jobs: Promise<void>[] = [];
  for (const m of post.matchAll(/<h[35]\b[^>]*>([\s\S]*?)<\/h[35]>/gi)) {
    const text = strip(m[1]);
    if (!/4k|\d{3,4}p/i.test(text) || /zip/i.test(text)) continue;
    const season = Number(/(?:season |s)(\d+)/i.exec(text)?.[1] || 0);
    if (!(season === s || (season === 0 && s === 1))) continue;
    const after = post.slice((m.index || 0) + m[0].length);
    const pM = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(after);
    const nextH = after.search(/<h[35]\b/i);
    const pool = pM && (nextH === -1 || pM.index < nextH) ? pM[1] : m[1];
    const aTags = anchors(pool).filter((a) => a.href);
    const uni =
      aTags.find((a) => /v-cloud|episode|download/i.test(a.text)) ||
      aTags.find((a) => /g-direct/i.test(a.text));
    if (!uni) continue;
    const q = parseQuality(text);
    jobs.push(
      (async () => {
        try {
          const h = await getHtml(abs(uni.href, base), 12000);
          const vlinks = anchors(h).filter(
            (a) => a.href && a.href.toLowerCase().includes("vcloud")
          );
          const pick = vlinks[e - 1];
          if (!pick) return;
          out.push({
            key: `vega-${q}-s${s}e${e}`,
            blog: "VegaMovies",
            quality: q,
            size: "",
            source: "V-Cloud",
            file: text.slice(0, 90),
            audio,
            hub: abs(pick.href, base),
            hubKind: "vcloud",
          });
        } catch {
          /* skip */
        }
      })()
    );
  }
  await Promise.all(jobs);
  return out;
}

/* ── MoviesDrive ── */
async function mdriveMovie(base: string, post: string, postTitle: string): Promise<Row[]> {
  const sizes = sizeMap(postTitle);
  const audio = parseAudio(postTitle);
  const out: Row[] = [];
  const jobs: Promise<void>[] = [];
  let i = 0;
  for (const m of post.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi)) {
    const b = anchors(m[1]).find((a) => a.href);
    if (!b) continue;
    const q = parseQuality(b.text);
    const idx = i++;
    jobs.push(
      (async () => {
        try {
          const h = await getHtml(abs(b.href, base), 12000);
          const hubs = anchors(h).filter((a) => a.href && /hubcloud|gdflix|gdlink/i.test(a.href));
          for (const [j, hb] of hubs.entries()) {
            out.push({
              key: `mdrive-${q}-${idx}-${j}`,
              blog: "MoviesDrive",
              quality: q,
              size: sizes.get(q.toLowerCase()) || "",
              source: hubLabel(hb.href),
              file: strip(postTitle).replace(/^Download\s+/i, "").slice(0, 90),
              audio,
              hub: abs(hb.href, base),
              hubKind: hubKind(hb.href),
            });
          }
        } catch {
          /* skip */
        }
      })()
    );
  }
  await Promise.all(jobs);
  return out;
}
async function mdriveSeries(
  base: string, post: string, postTitle: string, s: number, e: number
): Promise<Row[]> {
  const audio = parseAudio(postTitle);
  const out: Row[] = [];
  const jobs: Promise<void>[] = [];
  for (const m of post.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi)) {
    const inner = m[1];
    if (/zip/i.test(strip(inner))) continue;
    const b = anchors(inner).find((a) => a.href);
    if (!b) continue;
    const before = strip(post.slice(Math.max(0, (m.index || 0) - 600), m.index || 0)).slice(-200);
    const season = Number(/(?:season |s)(\d+)/i.exec(`${before} ${strip(inner)}`)?.[1] || 0);
    if (!(season === s || (season === 0 && s === 1))) continue;
    const q = parseQuality(strip(inner));
    jobs.push(
      (async () => {
        try {
          const h = await getHtml(abs(b.href, base), 12000);
          const hubPos: { pos: number; href: string }[] = [];
          for (const hm of h.matchAll(
            /<a\b[^>]*href="([^"]*(?:hubcloud|gdflix|gdlink)[^"]*)"[^>]*>/gi
          )) {
            hubPos.push({ pos: hm.index || 0, href: hm[1] });
          }
          const epMarks: { pos: number; ep: number }[] = [];
          for (const em of h.matchAll(/Ep(\d{2})/g)) {
            epMarks.push({ pos: em.index || 0, ep: Number(em[1]) });
          }
          const mine = epMarks.find((x) => x.ep === e);
          let picked: string[] = [];
          if (mine) {
            const next = epMarks.filter((x) => x.pos > mine.pos).map((x) => x.pos);
            const end = next.length ? Math.min(...next) : Infinity;
            picked = hubPos.filter((x) => x.pos > mine.pos && x.pos < end).map((x) => x.href);
          }
          if (!picked.length) {
            /* fallback: HubCloud/GDFlix-text anchors, eth one */
            const named = anchors(h).filter(
              (a) => a.href && /hubcloud|gdflix/i.test(a.text) && /hubcloud|gdflix|gdlink/i.test(a.href)
            );
            if (named[e - 1]) picked = [named[e - 1].href];
          }
          for (const [j, href] of picked.entries()) {
            out.push({
              key: `mdrive-${q}-s${s}e${e}-${j}`,
              blog: "MoviesDrive",
              quality: q,
              size: "",
              source: hubLabel(href),
              file: strip(inner).slice(0, 90),
              audio,
              hub: abs(href, base),
              hubKind: hubKind(href),
            });
          }
        } catch {
          /* skip */
        }
      })()
    );
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
  base: string, postUrl: string, postTitle: string, series: boolean, s: number, e: number
): Promise<Row[]> {
  const post = await getHtml(postUrl, 15000);
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
        return hdmovie2Rows(base, hit.url, hit.title, series, s, e);
      }
      const hits = await searchBlog(base, title);
      const hit = pickHit(hits, title, year, imdb);
      if (!hit) return [];
      const post = await getHtml(abs(hit.url, base), 15000);
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
