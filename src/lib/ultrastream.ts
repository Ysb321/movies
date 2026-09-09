/* UltraStream (Server 14) - the newhdmovie2 "Ultra Stream" players,
 * embedded AS-IS (their player, not our links): DooPlay search ->
 * post page [data-source-embed] player urls ("Ultra Stream V3",
 * "Ultra Stream 2", ...) -> picked from chips and iframed by
 * UltraPlayer. Movies + series (per-episode pages carry their own
 * embeds). Chain ported from the Prashant825567 provider-hdmovie2
 * Stremio provider (Jul 2026, newhdmovie2.im), pointed at the user's
 * domain (newhdmovie2.best, .im fallback).
 * resolveUltraEmbeds() is the live path; resolveUltraStream() (direct
 * HLS/mp4 finals) is kept as an unused fallback path.
 * Edge-safe: native fetch + regex, no deps, ~5 subrequests/cold run. */

export type UltraStreamArgs = {
  title: string;
  year?: string;
  kind: "movie" | "series";
  season: number;
  episode: number;
};

export type UltraEmbed = {
  title: string;
  url: string;
};

export type UltraEmbedsResult = {
  title: string;
  embeds: UltraEmbed[];
  noSource: boolean;
  laneError?: string;
  diag: string;
};

export type UltraStreamRow = {
  url: string;
  quality: string;
  platform: string;
};

export type UltraStreamResult = {
  title: string;
  streams: UltraStreamRow[];
  captions: { lang: string; name: string; url: string }[];
  noSource: boolean;
  laneError?: string;
  diag: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const T_GET = 9000;
const T_HEAD = 6000;
const BASE_TTL = 4 * 3600 * 1000;
const RESULT_TTL = 4 * 3600 * 1000;

const BASES = ["https://newhdmovie2.best", "https://newhdmovie2.im"];

let baseCache = { at: 0, base: "" };
const resultCache = new Map<string, { at: number; data: UltraStreamResult | UltraEmbedsResult }>();

type GetOut = { status: number; text: string; url: string };

async function httpGet(url: string, headers?: Record<string, string>, timeoutMs = T_GET): Promise<GetOut> {
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*", ...headers },
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, text, url: res.url || url };
  } finally {
    clearTimeout(killer);
  }
}

async function httpHead(url: string): Promise<number> {
  try {
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), T_HEAD);
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": UA, Range: "bytes=0-1" },
        signal: ctrl.signal,
      });
      return res.status;
    } finally {
      clearTimeout(killer);
    }
  } catch {
    return 0;
  }
}

async function httpPostForm(
  url: string,
  params: Record<string, string>,
  headers?: Record<string, string>,
  timeoutMs = T_GET
): Promise<GetOut> {
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: new URLSearchParams(params).toString(),
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, text, url: res.url || url };
  } finally {
    clearTimeout(killer);
  }
}

async function pickBase(d: string[]): Promise<string> {
  if (baseCache.base && Date.now() - baseCache.at < BASE_TTL) return baseCache.base;
  for (const b of BASES) {
    try {
      const r = await httpGet(b, undefined, 7000);
      if (r.status >= 200 && r.status < 400 && /hdmovie2/i.test(r.text.slice(0, 60000))) {
        baseCache = { at: Date.now(), base: b };
        d.push(`base=${b}`);
        return b;
      }
      d.push(`base ${b} bad(${r.status})`);
    } catch (e) {
      d.push(`base ${b} err:${e instanceof Error ? e.message.slice(0, 30) : "?"}`);
    }
  }
  throw new Error("no reachable hdmovie2 base");
}

type Hit = { title: string; url: string };

const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

const unescapeAttr = (s: string) => {
  const once = (x: string) =>
    x
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&");
  /* twice: survives double-escaped attrs (&amp;quot;) as well as single */
  return once(once(s));
};

/* search page -> post hits (article.item cards, /movie/ anchor fallback) */
function parseSearch(html: string, base: string): Hit[] {
  const seen = new Map<string, string>();
  const push = (url: string, title: string) => {
    const t = strip(title).slice(0, 140);
    if (!t || seen.has(url)) return;
    seen.set(url, t);
  };
  for (const m of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    const card = m[1];
    const h3 = /<h3\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    if (h3) {
      try {
        push(new URL(h3[1], base).href, h3[2]);
        continue;
      } catch {}
    }
    const pa = /<a\b[^>]*href="([^"]+)"[^>]*>\s*<img\b[^>]*alt="([^"]*)"/i.exec(card);
    if (pa) {
      try {
        push(new URL(pa[1], base).href, pa[2]);
      } catch {}
    }
  }
  if (!seen.size) {
    for (const m of html.matchAll(/<a\b[^>]*href="([^"]*\/movie\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      try {
        const url = new URL(m[1], base).href;
        const t = strip(m[2]).slice(0, 140);
        if (!t) continue;
        const prev = seen.get(url);
        if (prev === undefined || t.length > prev.length) seen.set(url, t);
      } catch {}
    }
  }
  return [...seen].map(([url, title]) => ({ title, url }));
}

const normWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

function pickHit(hits: Hit[], title: string, year: string, series: boolean, season: number): { hit: Hit; strict: boolean } | null {
  const qw = normWords(title);
  if (!qw.length) return null;
  const scored = hits.map((h) => {
    const hw = new Set(normWords(h.title));
    const overlap = qw.filter((w) => hw.has(w)).length / qw.length;
    const yearHit = !!year && h.title.includes(year);
    const hindiHit = /hindi|dubbed|dual/i.test(h.title);
    const seasonHit = new RegExp(`season\\s*0*${season}\\b`, "i").test(h.title);
    let score = overlap * 10 + (yearHit ? 2 : 0) + (hindiHit ? 1 : 0);
    if (series) score += seasonHit ? 4 : -3;
    return { h, overlap, yearHit, seasonHit, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.overlap < 0.34) return null;
  if (series && scored.some((s) => s.seasonHit) && !top.seasonHit) {
    const sTop = scored.find((s) => s.seasonHit && s.overlap >= 0.34);
    if (sTop) return { hit: sTop.h, strict: sTop.overlap >= 0.66 && (!year || sTop.yearHit) };
  }
  return { hit: top.h, strict: top.overlap >= 0.66 && (!year || top.yearHit) };
}

/* post/episode page -> [data-source-embed] player urls (+ nearby .title) */
function parseEmbeds(html: string, base: string): UltraEmbed[] {
  const out: UltraEmbed[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/data-source-embed="([^"]*)"/gi)) {
    const inner = unescapeAttr(m[1]);
    const src = /src="([^"]+)"/i.exec(inner)?.[1] || /src='([^']+)'/i.exec(inner)?.[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    let abs = "";
    try {
      abs = new URL(src, base).href;
    } catch {
      continue;
    }
    const at = m.index ?? 0;
    const after = html.slice(at + m[0].length, at + m[0].length + 1500);
    const t = /class="title"[^>]*>([^<]{1,60})</i.exec(after)?.[1]?.trim() || `Stream ${out.length + 1}`;
    out.push({ title: strip(t).slice(0, 60) || `Stream ${out.length + 1}`, url: abs });
    if (out.length >= 4) break;
  }
  return out;
}

/* download-button fallback (hdm.im pages sometimes carry embeds too) */
function parseDlLinks(html: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of html.matchAll(
    /<a\b[^>]*class="[^"]*action-view-dl[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  )) {
    out.push({ url: m[1], text: strip(m[2]).slice(0, 80) });
    if (out.length >= 6) break;
  }
  return out;
}

/* episode anchors: text like "Episode 3", "S01E03", "3. ..." */
function findEpisodeUrl(html: string, base: string, season: number, episode: number): string | null {
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = strip(m[2]).slice(0, 80);
    if (!text || /action-view-dl/i.test(m[0])) continue;
    const se = /\b[sS]0*(\d+)\s*[eE]0*(\d+)\b/.exec(text);
    const ep = se ? null : /(?:episode|ep\.?)\s*0*(\d+)/i.exec(text) || /^0*(\d+)\.\s/.exec(text);
    const epNum = se ? Number(se[2]) : ep ? Number(ep[1]) : -1;
    if (epNum !== episode) continue;
    if (se && Number(se[1]) !== season) continue;
    try {
      const u = new URL(m[1], base);
      if (!/^https?:$/i.test(u.protocol)) continue;
      if (u.hostname.endsWith("hdm.im")) continue;
      return u.href;
    } catch {
      continue;
    }
  }
  return null;
}

/* search -> match -> post -> (episode) -> player embeds. Throws on failure. */
async function locateEmbeds(
  title: string,
  year: string,
  kind: "movie" | "series",
  season: number,
  episode: number,
  d: string[],
  notes: string[]
): Promise<{ postTitle: string; embeds: UltraEmbed[]; base: string }> {
  const note = (s: string) => {
    if (notes.length < 16) notes.push(s);
  };
  const base = await pickBase(d);

  let searchHtml: GetOut;
  try {
    searchHtml = await httpGet(`${base}/?s=${encodeURIComponent(title)}`);
  } catch (e) {
    throw new Error(`search failed: ${e instanceof Error ? e.message.slice(0, 60) : "?"}`);
  }
  if (searchHtml.status < 200 || searchHtml.status >= 400) {
    throw new Error(`search http ${searchHtml.status}`);
  }
  const hits = parseSearch(searchHtml.text, base);
  d.push(`search: ${hits.length} hits`);
  const directPost = !hits.length && /data-source-embed=/i.test(searchHtml.text);

  let postUrl = "";
  let postTitle = "";
  if (directPost) {
    postUrl = searchHtml.url;
    postTitle = title;
    d.push("match-direct");
  } else {
    const picked = pickHit(hits, title, year, kind === "series", season);
    if (!picked) throw new Error(`no match (${hits.length} hits)`);
    postUrl = picked.hit.url;
    postTitle = picked.hit.title;
    d.push(picked.strict ? "match-strict" : "match-loose");
  }

  let postHtml: string;
  try {
    const r = directPost ? searchHtml : await httpGet(postUrl, { Referer: base });
    if (r.status < 200 || r.status >= 400) throw new Error(`post http ${r.status}`);
    postHtml = r.text;
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "post failed");
  }
  d.push(`post: "${postTitle.slice(0, 50)}"`);

  if (kind === "series") {
    const epUrl = findEpisodeUrl(postHtml, base, season, episode);
    note(`ep:${epUrl ? "found" : "missing"}`);
    if (epUrl) {
      try {
        const r = await httpGet(epUrl, { Referer: postUrl });
        if (r.status >= 200 && r.status < 400) postHtml = r.text;
        else note(`ep:http${r.status}`);
      } catch (e) {
        note(`ep:err:${(e instanceof Error ? e.message : "?").slice(0, 30)}`);
      }
    }
  }

  /* marker sweep + snippet: see the live player wiring through the diag */
  {
    const H = postHtml;
    const has = (s: string) => H.includes(s);
    const marks = [
      has("Ultra Stream") ? "US" : "",
      has("data-source-embed") ? "DSE" : "",
      has("action-view-dl") ? "AVD" : "",
      has("admin-ajax") ? "AJAX" : "",
      has("doo_player") ? "DOO" : "",
      has("hdm2.biz") ? "HDM2" : "",
      has("prvs.top") ? "PRVS" : "",
      has("<iframe") ? "IFR" : "",
      has("hdm.im") ? "HDMIM" : "",
      /Just a moment|__cf_chl|cf-clearance/i.test(H) ? "CF" : "",
    ]
      .filter((x) => x)
      .join(",");
    note(`m:${marks || "none"}/${H.length}`);
    const key = H.indexOf("data-source-embed") >= 0 ? "data-source-embed" : "Ultra Stream";
    const ki = H.indexOf(key);
    if (ki >= 0) {
      const snip = H.slice(Math.max(0, ki - 60), ki + 160)
        .replace(/\s+/g, " ")
        .slice(0, 220);
      note(`snip:${snip}`);
    }
  }
  let embeds = parseEmbeds(postHtml, base);
  if (!embeds.length) {
    const dl = parseDlLinks(postHtml);
    note(`dl:${dl.length}`);
    if (dl.length) {
      try {
        const r = await httpGet(dl[0].url, { Referer: postUrl });
        if (r.status >= 200 && r.status < 400) embeds = parseEmbeds(r.text, base);
      } catch {}
    }
  }
  if (!embeds.length) {
    const pid = /-(\d+)\/?(?:[?#]|$)/.exec(postUrl)?.[1] || "";
    if (pid) {
      try {
        const r = await httpPostForm(
          `${base}/wp-admin/admin-ajax.php`,
          { action: "doo_player_ajax", post: pid, nume: "1", type: kind === "series" ? "tv" : "movie" },
          { Referer: postUrl }
        );
        const preview = r.text.replace(/\s+/g, " ").slice(0, 140);
        note(`ajax:${r.status}/${preview || "empty"}`);
      } catch (e) {
        note(`ajax:err:${(e instanceof Error ? e.message : "?").slice(0, 30)}`);
      }
    } else {
      note("ajax:nopid");
    }
  }
  d.push(`embeds: ${embeds.length}${embeds.length ? ` (${embeds.map((e) => e.title).join(", ").slice(0, 80)})` : ""}`);
  if (!embeds.length) throw new Error("post has no stream embeds");
  return { postTitle, embeds, base };
}

/* LIVE PATH: player urls for UltraPlayer to iframe as-is. */
export async function resolveUltraEmbeds(args: UltraStreamArgs): Promise<UltraEmbedsResult> {
  const { title, year = "", kind, season, episode } = args;
  const d: string[] = [`us: "${title.slice(0, 60)}" ${kind}`];
  const notes: string[] = [];
  const cacheKey = `emb:${kind}:${title.toLowerCase()}:${year}:${season}:${episode}`;
  const cached = resultCache.get(cacheKey);
  if (cached && "embeds" in cached.data && Date.now() - cached.at < RESULT_TTL) return cached.data;

  const diag = () => `${d.join(" | ")}${notes.length ? ` | final: ${notes.join("; ")}` : ""}`;
  try {
    const { postTitle, embeds } = await locateEmbeds(title, year, kind, season, episode, d, notes);
    const data: UltraEmbedsResult = {
      title: postTitle.slice(0, 140),
      embeds,
      noSource: false,
      diag: diag(),
    };
    resultCache.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ultrastream failed";
    return { title: "", embeds: [], noSource: true, laneError: msg.slice(0, 160), diag: diag() };
  }
}

/* embed page -> direct file (hdm2.ink HLS / prvs.top JW file:).
 * FALLBACK PATH, currently unused by the UI (embed-first by request). */
async function resolveEmbed(embed: UltraEmbed, referer: string, note: (s: string) => void): Promise<string | null> {
  let host = "";
  try {
    host = new URL(embed.url).hostname;
  } catch {
    return null;
  }
  const r = await httpGet(embed.url, { Referer: referer });
  if (r.status < 200 || r.status >= 400) {
    note(`emb:${host}=http${r.status}`);
    return null;
  }
  /* hdm2.* (live host is hdm2.biz/play?v= - same player family) */
  if (host.includes("hdm2.")) {
    const path = /data-stream-url="([^"]+)"/i.exec(r.text)?.[1];
    note(`emb:${host}=${path ? "hls" : "no-stream-url"}`);
    if (!path) return null;
    try {
      return new URL(path, `https://${host}`).href;
    } catch {
      return null;
    }
  }
  if (host.includes("prvs.top")) {
    const file = /file["']?\s*:\s*["']([^"']+)["']/i.exec(r.text)?.[1];
    if (file) {
      note(`emb:${host}=jw`);
      try {
        return new URL(file.startsWith("//") ? `https:${file}` : file, `https://${host}`).href;
      } catch {
        return null;
      }
    }
    const vsrc =
      /<video\b[^>]*\bsrc="([^"]+)"/i.exec(r.text)?.[1] ||
      /<source\b[^>]*\bsrc="([^"]+)"/i.exec(r.text)?.[1];
    note(`emb:${host}=${vsrc ? "video-tag" : "none"}`);
    if (!vsrc) return null;
    try {
      return new URL(vsrc.startsWith("//") ? `https:${vsrc}` : vsrc, `https://${host}`).href;
    } catch {
      return null;
    }
  }
  note(`emb:${host}=unhandled-host`);
  return null;
}

/* FALLBACK PATH: same embeds resolved to direct files. Unused by the UI. */
export async function resolveUltraStream(args: UltraStreamArgs): Promise<UltraStreamResult> {
  const { title, year = "", kind, season, episode } = args;
  const d: string[] = [`us: "${title.slice(0, 60)}" ${kind}`];
  const notes: string[] = [];
  const note = (s: string) => {
    if (notes.length < 16) notes.push(s);
  };
  const cacheKey = `lnk:${kind}:${title.toLowerCase()}:${year}:${season}:${episode}`;
  const cached = resultCache.get(cacheKey);
  if (cached && "streams" in cached.data && Date.now() - cached.at < RESULT_TTL) return cached.data;

  const diag = () => `${d.join(" | ")}${notes.length ? ` | final: ${notes.join("; ")}` : ""}`;
  try {
    const { postTitle, embeds, base } = await locateEmbeds(title, year, kind, season, episode, d, notes);
    const jobs = embeds.slice(0, 3).map(async (emb): Promise<UltraStreamRow | null> => {
      try {
        const final = await resolveEmbed(emb, base, note);
        if (!final || !/^https?:/i.test(final)) return null;
        const st = await httpHead(final);
        try {
          note(`val:${new URL(final).hostname}=${st}`);
        } catch {}
        if (st >= 400 && st < 600) return null;
        return { url: final, quality: "1080", platform: emb.title || "UltraStream" };
      } catch (e) {
        note(`err:${(e instanceof Error ? e.message : "?").slice(0, 50)}`);
        return null;
      }
    });
    const rows = (await Promise.all(jobs)).filter((x): x is UltraStreamRow => !!x);
    const seen = new Set<string>();
    const streams = rows.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
    d.push(`streams: ${streams.length}`);
    const data: UltraStreamResult = {
      title: postTitle.slice(0, 140),
      streams,
      captions: [],
      noSource: streams.length === 0,
      diag: diag(),
    };
    if (!data.noSource) resultCache.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ultrastream failed";
    return { title: "", streams: [], captions: [], noSource: true, laneError: msg.slice(0, 160), diag: diag() };
  }
}
