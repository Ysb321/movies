/** "Multi Dub" stream sources - WebStreamrMBG addon.
 * A true multi-source aggregator (Reddit's top free HTTP pick for Hindi
 * content): 4KHDHub, HDHub4u, MovieBox, VidZee, VidSrc, VixSrc + more,
 * 12 languages incl. Hindi. Queried client-side (CORS-open Stremio
 * addon). Stream URLs are the addon's /extract/ endpoints which redirect
 * server-side to the FINAL DIRECT FILE (verified live: extract URL 302s
 * through hubcloud to the file) - the player resolves them via
 * /api/dub/resolve and plays instantly. */

export type DubStream = {
  url: string;           // extract endpoint (resolved at play time) or direct URL
  quality: string;       // "2160p" | "1080p" | ...
  langs: string[];       // ["Hindi", "English"]
  size: string;          // "8.37 GB"
  host: string;          // "HubCloud (10Gbps) from 4KHDHub"
  codecNote: string;     // warnings ("no seek", "Dolby may be silent")
  isHls: boolean;        // .m3u8 -> multi-audio HLS
  webSafe: boolean;      // H.264/AAC - plays everywhere with sound
  isDirect?: boolean;    // playable as-is (no resolve needed)
  codec: string;         // "H.264" (light) | "HEVC" (needs hw decode)
};

const WSMBG = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";
const WSMBG_CFG = encodeURIComponent(
  JSON.stringify({ multi: "on", hi: "on", ta: "on", te: "on", ml: "on", pa: "on", gu: "on", includeExternalUrls: "on" })
);
const TMDB_KEY = "f8243ad5d5cd1ef0ebe5d6c5bfcc59f2";

const LANG_WORDS: [RegExp, string][] = [
  [/hindi|\bhin\b|\bhi\b/i, "Hindi"], [/english|eng\b|\ben\b/i, "English"], [/tamil/i, "Tamil"],
  [/telugu/i, "Telugu"], [/malayalam/i, "Malayalam"], [/punjabi/i, "Punjabi"],
  [/gujarati/i, "Gujarati"], [/korean/i, "Korean"], [/dual/i, "Dual"],
  [/german|deutsch/i, "German"], [/spanish|español/i, "Spanish"],
];

function pick(re: RegExp, s: string): string | null {
  const m = s.match(re);
  return m ? m[1] : null;
}

type Meta = { title: string; year: number; imdbId: string };

async function fetchMeta(type: "movie" | "tv", tmdbId: string | number): Promise<Meta> {
  try {
    const r = await fetch(
      `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`,
      { signal: AbortSignal.timeout(7000) }
    );
    const j = await r.json().catch(() => null);
    const date: string = j?.release_date ?? j?.first_air_date ?? "";
    return {
      title: j?.title ?? j?.name ?? "",
      year: parseInt(date.slice(0, 4), 10) || 0,
      imdbId: j?.external_ids?.imdb_id ?? j?.imdb_id ?? "",
    };
  } catch {
    return { title: "", year: 0, imdbId: "" };
  }
}

/* guard against wrong-title results (fuzzy addon searches): a title
 * token must appear AND the year (if present) must match; episodes must
 * contain SxxEyy. */
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function streamMatches(
  blob: string,
  meta: Meta,
  type: "movie" | "tv",
  season?: number,
  episode?: number
): boolean {
  const b = norm(blob);
  const tokens = norm(meta.title).split(" ").filter((w) => w.length > 3);
  const tokenOK = !tokens.length || tokens.some((t) => b.includes(t));

  if (type === "tv") {
    if (!tokenOK) return false;
    const s = season ?? 1, e = episode ?? 1;
    return (
      new RegExp(`s0*${s}\\s?e0*${e}\\b`, "i").test(b) ||
      new RegExp(`(^|\\s)0*${s}x0*${e}(\\s|$)`).test(b)
    );
  }

  if (!tokenOK) return false;
  if (!meta.year) return true;
  const years = (blob.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
  if (!years.length) return true;
  return years.some((y) => Math.abs(y - meta.year) <= 1);
}

/* resolve a WebStreamrMBG extract endpoint to the final direct URL
 * (server-side redirect hop) - used by the player on chip click */
export async function resolveDubStream(url: string): Promise<string | null> {
  if (!url.startsWith(WSMBG)) return url; /* already direct */
  try {
    const r = await fetch(`/api/dub/resolve?u=${encodeURIComponent(url)}`, {
      headers: { accept: "application/json" },
    });
    const j = await r.json().catch(() => null);
    return typeof j?.url === "string" && /^https?:\/\//.test(j.url) ? j.url : null;
  } catch {
    return null;
  }
}

export async function fetchDubStreams(
  type: "movie" | "tv",
  tmdbId: string | number,
  season?: number,
  episode?: number
): Promise<DubStream[]> {
  const kind = type === "tv" ? "series" : "movie";
  const sep = type === "tv" ? `:${season ?? 1}:${episode ?? 1}` : "";
  const meta = await fetchMeta(type, tmdbId);

  const ids = meta.imdbId ? [`${meta.imdbId}${sep}`, `tmdb:${tmdbId}${sep}`] : [`tmdb:${tmdbId}${sep}`];
  let streams: any[] = [];
  for (const id of ids) {
    try {
      const r = await fetch(`${WSMBG}/${WSMBG_CFG}/stream/${kind}/${encodeURIComponent(`${id}.json`)}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(25000),
      });
      const j = await r.json().catch(() => null);
      const found: any[] = (j?.streams ?? []).filter((s: any) => s?.url && typeof s.url === "string");
      if (found.length) { streams = found; break; }
    } catch { /* try the next id form */ }
  }

  const out: DubStream[] = [];
  for (const s of streams) {
    const name: string = s.name ?? "";
    const title: string = s.title ?? s.description ?? "";
    const blob = `${name}\n${title}`;

    if (!streamMatches(blob, meta, type, season, episode)) continue;

    const quality =
      (name.match(/(\d{3,4}p)/) ?? [])[1] ??
      (title.match(/(\d{3,4}p)/) ?? [])[1] ??
      (/4k|2160/i.test(blob) ? "2160p" : /720/i.test(blob) ? "720p" : "SD");

    let langs = LANG_WORDS.filter(([re]) => re.test(blob)).map(([, l]) => l);
    if (!langs.length) langs = ["—"];

    const size = pick(/💾 ([\d.]+ ?[GM]B)/, title) ?? "";
    const host = pick(/🔗 (.+)$/, title) ?? "WebStreamr";
    const dolby = /DDP|DD\+|Dolby|EAC3|AC-?3|TrueHD|DTS|Atmos/i.test(blob);
    const hevc = /HEVC|x265|H\.?265|10bit/i.test(blob);
    const isHls = /\.m3u8(\?|$)/i.test(s.url);
    const mkv = /\.mkv|\bMKV\b/i.test(blob);
    const webSafe = isHls || (!dolby && !mkv);
    /* extract endpoints need resolving; external URLs are already direct */
    const isDirect = !s.url.includes("/extract/");

    const notes: string[] = [];
    if (dolby) notes.push("Dolby/DTS audio may be silent in-browser");
    if (mkv) notes.push("MKV container");
    if (/no seek/i.test(blob)) notes.push("no seek");

    out.push({
      url: s.url,
      quality, langs, size, host,
      codec: hevc ? "HEVC" : "H.264",
      codecNote: notes.join(" · "),
      isHls, webSafe,
      isDirect,
    });
  }

  /* sort: web-safe first, then SMOOTHNESS (H.264 1080p leads - light
   * decode; HEVC and >1080p sink, they stutter on low-end machines) */
  const qOrder = (q: string) => (q.includes("1080") ? 0 : q.includes("2160") || /4k/i.test(q) ? 1 : q.includes("720") ? 2 : 3);
  const sizeNum = (s: string) => parseFloat(s) || 0;
  const hgt = (q: string) => parseInt(q, 10) || 0;
  const smooth = (d: DubStream) => (d.codec === "HEVC" ? 10 : 0) + (hgt(d.quality) > 1080 ? 1 : 0);
  return out.sort((a, b) =>
    Number(b.webSafe) - Number(a.webSafe) ||
    smooth(a) - smooth(b) ||
    qOrder(a.quality) - qOrder(b.quality) ||
    sizeNum(a.size) - sizeNum(b.size)
  );
}
