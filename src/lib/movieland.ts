/* Movieland (Server 17): AllMovieLand direct-m3u8 lane, ported from
 * EpicGGCoder/allmovieland-api. DLE blog (allmovieland.art, Hindi /
 * Tamil / Telugu / Bengali) -> detail page player config
 * (AwsIndStreamDomain + src stream id - the SAME slast backend Server
 * 16 embeds) -> HDVBPlayer embed page -> playlist API (X-CSRF-TOKEN)
 * -> per-language m3u8, played in HindiSources/SitePlayer. Movies +
 * series (folder walk to S/E). Deviations: no TMDB lookup (we pass
 * our own title), adaptive playlist POST (single first, bulk x3 only
 * when rate-limited - upstream always fires x10), top-resolution row
 * labels from the master playlist. Edge-safe, ~18 subrequests cold. */

export type MovielandArgs = {
  title: string;
  year?: string;
  kind: "movie" | "series";
  season: number;
  episode: number;
};

export type MovielandStream = {
  url: string;
  quality: string;
  platform: string;
  lang: string;
};

export type MovielandResult = {
  title: string;
  streams: MovielandStream[];
  captions: { lang: string; name: string; url: string }[];
  noSource: boolean;
  laneError?: string;
  diag: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";
const T_GET = 9000;
const RESULT_TTL = 4 * 3600 * 1000;

const BASES = ["https://allmovieland.art", "https://allmovieland.one"];

const resultCache = new Map<string, { at: number; data: MovielandResult }>();

type GetOut = { status: number; text: string; url: string; cookie: string };

async function httpGet(url: string, headers?: Record<string, string>, timeoutMs = T_GET): Promise<GetOut> {
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*", ...headers },
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, text, url: res.url || url, cookie: res.headers.get("set-cookie") || "" };
  } finally {
    clearTimeout(killer);
  }
}

async function httpPost(url: string, headers?: Record<string, string>, body?: string, timeoutMs = T_GET): Promise<GetOut> {
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", ...headers },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, text, url: res.url || url, cookie: "" };
  } finally {
    clearTimeout(killer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

const absUrl = (href: string, base: string): string | null => {
  try {
    const u = new URL(href, base);
    return /^https?:$/i.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};

/* playlist POST: single first, bulk x3 after a pause when rate-limited
 * (bare digits = wait-seconds, or 404) - upstream always fires x10 */
async function playlistPost(url: string, headers: Record<string, string>, note: (s: string) => void): Promise<string | null> {
  const limited = (t: string) => !t || /^\d+$/.test(t.trim()) || t.includes("404 Not Found");
  try {
    const r = await httpPost(url, headers);
    if (r.status >= 200 && r.status < 400 && !limited(r.text)) return r.text;
  } catch {}
  note("post:bulk3");
  await sleep(1500);
  const jobs = [0, 1, 2].map(async (): Promise<string | null> => {
    try {
      const r = await httpPost(url, headers);
      return r.status >= 200 && r.status < 400 && !limited(r.text) ? r.text : null;
    } catch {
      return null;
    }
  });
  return (await Promise.all(jobs)).find((x) => x) || null;
}

function parseBalancedJson(h: string, start: number): { key?: string; file?: string } | null {
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < h.length; i++) {
    if (h[i] === "{") depth++;
    else if (h[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(h.substring(start, i + 1)) as { key?: string; file?: string };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractPlayerConfig(html: string): { key?: string; file?: string } | null {
  const hdvbIdx = html.indexOf("new HDVBPlayer");
  if (hdvbIdx !== -1) {
    const cfg = parseBalancedJson(html, html.indexOf("{", hdvbIdx));
    if (cfg && cfg.key) return cfg;
  }
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const last = scripts.length ? scripts[scripts.length - 1] : "";
  const start = last.indexOf("{");
  const end = last.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(last.substring(start, end + 1)) as { key?: string; file?: string };
    } catch {
      return null;
    }
  }
  return null;
}

type Hit = { title: string; href: string; type: string };

const normWords = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);

type FileItem = { title?: string; id?: string; file?: string };

export async function resolveMovieland(args: MovielandArgs): Promise<MovielandResult> {
  const { title, year = "", kind, season, episode } = args;
  const d: string[] = [`ml: "${title.slice(0, 60)}" ${kind}`];
  const notes: string[] = [];
  const note = (s: string) => {
    if (notes.length < 14) notes.push(s);
  };
  const cacheKey = `ml:${kind}:${title.toLowerCase()}:${year}:${season}:${episode}`;
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RESULT_TTL) return cached.data;
  const diag = () => `${d.join(" | ")}${notes.length ? ` | final: ${notes.join("; ")}` : ""}`;
  const fail = (msg: string): MovielandResult => ({
    title: "", streams: [], captions: [], noSource: true, laneError: msg.slice(0, 160), diag: diag(),
  });

  /* 1. session (cookie may be invisible on edge - proceed regardless) */
  let base = "";
  let sessionId = "";
  for (const b of BASES) {
    try {
      const r = await httpGet(`${b}/`, undefined, 7000);
      if (r.status < 200 || r.status >= 400) continue;
      base = b;
      sessionId = /PHPSESSID=([^;]+)/.exec(r.cookie)?.[1] || "";
      break;
    } catch {}
  }
  if (!base) return fail("no reachable movieland base");
  d.push(`base=${base.split(".")[1]}`);
  note(`sess:${sessionId ? "yes" : "no"}`);
  const cookie: Record<string, string> = sessionId ? { Cookie: `PHPSESSID=${sessionId}` } : {};

  /* 2. DLE search */
  let hits: Hit[] = [];
  try {
    const r = await httpPost(
      `${base}/index.php?do=search`,
      { ...cookie, Referer: `${base}/` },
      `do=search&subaction=search&search_start=0&full_search=0&result_from=1&story=${encodeURIComponent(title)}`
    );
    if (r.status < 200 || r.status >= 400) return fail(`search http ${r.status}`);
    for (const m of r.text.matchAll(/<article[^>]*class="[^"]*short-mid[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)) {
      const block = m[1];
      const t = strip(/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(block)?.[1] || "").slice(0, 140);
      const href = /<a[^>]*href="([^"]+)"/i.exec(block)?.[1] || "";
      const cats = strip(/<span[^>]*class="[^"]*new-short__cats[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] || "").toLowerCase();
      const type = cats.includes("series") ? "tvseries" : cats.includes("films") ? "movie" : "cartoon";
      if (t && href) hits.push({ title: t, href, type });
      if (hits.length >= 10) break;
    }
  } catch (e) {
    return fail(`search failed: ${e instanceof Error ? e.message.slice(0, 50) : "?"}`);
  }
  d.push(`search: ${hits.length} hits`);
  if (!hits.length) return fail("no search hits");

  /* 3. match (overlap + type + year) */
  const qw = normWords(title);
  const wantType = kind === "series" ? "tvseries" : "movie";
  const scored = hits.map((h) => {
    const hw = new Set(normWords(h.title));
    const overlap = qw.length ? qw.filter((w) => hw.has(w)).length / qw.length : 0;
    const typeHit = h.type === wantType;
    const yearHit = !!year && h.title.includes(year);
    return { h, overlap, score: overlap * 10 + (typeHit ? 2 : -2) + (yearHit ? 2 : 0) };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (top.overlap < 0.4) return fail(`no match (${hits.length} hits)`);
  d.push(top.overlap >= 0.66 ? "match-strict" : "match-loose");
  const detailUrl = absUrl(top.h.href, base);
  if (!detailUrl) return fail("bad post url");

  /* 4. detail -> player domain + stream id */
  let detailTitle = top.h.title;
  let playerDomain = "";
  let streamId = "";
  try {
    const r = await httpGet(detailUrl, { ...cookie, Referer: `${base}/` });
    if (r.status < 200 || r.status >= 400) return fail(`post http ${r.status}`);
    const rawTitle = strip(/<h1[^>]*class="[^"]*fs__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(r.text)?.[1] || "");
    if (rawTitle) detailTitle = rawTitle.slice(0, 140);
    playerDomain = (/const\s+AwsIndStreamDomain\s*=\s*'([^']+)'/i.exec(r.text)?.[1] || "").replace(/\/+$/, "");
    streamId = /src:\s*'([^']+)'/i.exec(r.text)?.[1] || "";
    if (!playerDomain || !streamId) return fail("post has no player config");
  } catch (e) {
    return fail(`post failed: ${e instanceof Error ? e.message.slice(0, 50) : "?"}`);
  }
  d.push(`post: "${detailTitle.slice(0, 40)}"`);
  note(`player:${hostOf(playerDomain)}`);

  /* 5. embed -> HDVBPlayer config */
  const embedLink = `${playerDomain}/play/${streamId}`;
  let cfg: { key?: string; file?: string } | null = null;
  try {
    const r = await httpGet(embedLink, { Referer: detailUrl });
    if (r.status < 200 || r.status >= 400) return fail(`embed http ${r.status}`);
    if (!r.text.includes("HDVBPlayer")) return fail("embed has no player");
    cfg = extractPlayerConfig(r.text);
    if (!cfg?.key || !cfg?.file) return fail("embed config unreadable");
  } catch (e) {
    return fail(`embed failed: ${e instanceof Error ? e.message.slice(0, 50) : "?"}`);
  }
  const tokenKey = cfg.key as string;
  const jsonfile = cfg.file as string;
  const playlistUrl = jsonfile.startsWith("http") ? jsonfile : `${playerDomain}/playlist/${jsonfile}`;

  /* 6. playlist items (languages / folders) */
  const raw = await playlistPost(playlistUrl, { "X-CSRF-TOKEN": tokenKey, Referer: embedLink }, note);
  if (!raw) return fail("playlist rate-limited");
  let items: FileItem[] = [];
  let rawCleaned = raw.replace(/,\s*\[\]/g, "");
  try {
    const parsed = JSON.parse(rawCleaned) as unknown;
    items = Array.isArray(parsed) ? (parsed as FileItem[]) : [parsed as FileItem];
  } catch {
    return fail("playlist unparsable");
  }
  d.push(`langs: ${items.length}`);

  /* 7. TV: folder walk to S/E (no extra fetches - data is in payload) */
  let wanted: FileItem[] = items;
  if (kind === "series") {
    if (rawCleaned.includes("folder")) {
      const eps: { season: number; episode: number; title: string; folder: FileItem[] }[] = [];
      for (const s of items as unknown as { id?: string; folder?: { episode?: string; title?: string; folder?: FileItem[] }[] }[]) {
        const sNum = parseInt(s.id || "") || 1;
        for (const ep of s.folder || []) {
          eps.push({ season: sNum, episode: parseInt(ep.episode || "") || 1, title: ep.title || "", folder: ep.folder || [] });
        }
      }
      const found = eps.find((e) => e.season === season && e.episode === episode);
      if (!found) return fail(`no S${season}E${episode} (${eps.length} eps)`);
      d.push(`ep: S${season}E${episode} "${found.title.slice(0, 30)}"`);
      wanted = found.folder.length ? found.folder : items;
    } else {
      note("ep:single");
    }
  }

  /* 8. per-language m3u8 (Hindi first, cap 2) + top-resolution labels */
  const withFile = wanted.filter((w) => w.file);
  withFile.sort((a, b) => (/hindi/i.test(b.title || "") ? 1 : 0) - (/hindi/i.test(a.title || "") ? 1 : 0));
  const jobs = withFile.slice(0, 2).map(async (item): Promise<MovielandStream | null> => {
    try {
      const fileId = (item.file as string).startsWith("~") ? (item.file as string).substring(1) : (item.file as string);
      const txt = await playlistPost(`${playerDomain}/playlist/${fileId}.txt`, {
        "X-CSRF-TOKEN": tokenKey, Referer: `${base}/`, Origin: playerDomain,
      }, note);
      if (!txt || !txt.trim().startsWith("http")) return null;
      const m3u8 = txt.trim();
      let quality = "Auto";
      try {
        const r = await httpGet(m3u8, { Referer: playerDomain, Origin: playerDomain });
        if (r.status >= 200 && r.status < 400) {
          let top = 0;
          for (const m of r.text.matchAll(/RESOLUTION=\d+x(\d+)/gi)) top = Math.max(top, Number(m[1]));
          if (top > 0) quality = `${top}p`;
        }
      } catch {}
      const lang = strip(item.title || "").slice(0, 30) || "Unknown";
      return { url: m3u8, quality, platform: `ML · ${lang}`, lang };
    } catch {
      return null;
    }
  });
  const streams = (await Promise.all(jobs)).filter((x): x is MovielandStream => !!x);
  d.push(`streams: ${streams.length}`);

  const data: MovielandResult = {
    title: detailTitle,
    streams,
    captions: [],
    noSource: streams.length === 0,
    diag: diag(),
  };
  if (!data.noSource) resultCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "?";
  }
};
