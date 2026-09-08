/** "Multi Dub" stream sources - Vega provider engine (vega-providers).
 * 50 bundled providers (vegamovies, 4khdhub, hdhub4u, multimovies,
 * moviesdrive, flixhq, kissKh, movieBox...) scraped server-side via
 * /api/vega; every returned link is DIRECT (m3u8 / mp4 / mkv) and
 * chips play instantly. */

export type DubStream = {
  url: string;
  quality: string;      // "1080p" | "2160p" | ...
  langs: string[];      // ["Hindi", "English"]
  size: string;         // "" (vega chips carry no size)
  host: string;         // provider · server (VegaMovies · FastDl)
  codecNote: string;    // warnings
  isHls: boolean;       // m3u8 -> VidStack quality/audio menus
  webSafe: boolean;     // browser-playable with sound
  isDirect?: boolean;   // always true
  codec: string;        // "H.264" | "HEVC" (download links are usually HEVC mkv)
  headers?: Record<string, string>; // host requires Referer/Cookie (gofile, embed CDNs)
  subs?: { title: string; language: string; uri: string; type: string }[];
};

const LANG_WORDS: [RegExp, string][] = [
  [/hindi|\bhin\b|\bhi\b/i, "Hindi"], [/english|eng\b|\ben\b/i, "English"], [/tamil/i, "Tamil"],
  [/telugu/i, "Telugu"], [/malayalam/i, "Malayalam"], [/punjabi/i, "Punjabi"],
  [/gujarati/i, "Gujarati"], [/korean/i, "Korean"], [/dual/i, "Dual"],
];

type VegaChip = {
  provider: string; server: string; link: string; type: string;
  quality?: string; title?: string; headers?: any;
  subtitles?: { title: string; language: string; uri: string; type: string }[];
};

const needsProxy = (c: VegaChip): boolean => {
  const h = c.headers;
  if (!h || typeof h !== "object") return false;
  const keys = Object.keys(h).map((k) => k.toLowerCase());
  return keys.includes("referer") || keys.includes("cookie") || keys.includes("user-agent");
};

const toDub = (c: VegaChip): DubStream => {
  const blob = `${c.server ?? ""} ${c.title ?? ""}`;
  const quality = c.quality ? `${c.quality}p` : (/2160|4k/i.test(blob) ? "2160p" : /1080/i.test(blob) ? "1080p" : /720/i.test(blob) ? "720p" : "Auto");
  let langs = LANG_WORDS.filter(([re]) => re.test(blob)).map(([, l]) => l);
  if (!langs.length) langs = ["—"];
  const isMkv = /mkv/i.test(String(c.type)) || /\.mkv(\?|$)/i.test(c.link) || /gdrive|gofile|hubcdn|cf storage/i.test(blob);
  const isHls = /m3u8/i.test(String(c.type)) || /\.m3u8(\?|$)/i.test(c.link);
  const webSafe = isHls || (!isMkv && /mp4|webm/i.test(String(c.type) || "mp4"));
  const hdrs = (c.headers && typeof c.headers === "object" ? c.headers : undefined) as Record<string, string> | undefined;
  let url = c.link;
  if (hdrs && needsProxy(c)) {
    const q = new URLSearchParams({ u: c.link });
    const ref = hdrs.Referer ?? hdrs.referer;
    const cookie = hdrs.Cookie ?? hdrs.cookie;
    if (ref) q.set("r", ref);
    if (cookie) q.set("c", cookie);
    url = `/api/stream-proxy?${q.toString()}`;
  }
  return {
    url,
    quality, langs,
    size: "",
    host: `${c.provider} · ${c.server ?? ""}`.replace(/ ·$/, ""),
    codecNote: isMkv ? "MKV / download link - VLC handles it (exe)" : "",
    isHls,
    webSafe,
    isDirect: true,
    codec: /hevc|x265|10bit|4k|2160/i.test(blob) ? "HEVC" : "H.264",
    headers: c.headers && typeof c.headers === "object" ? c.headers : undefined,
    subs: Array.isArray(c.subtitles) ? c.subtitles : undefined,
  };
};

const sortChips = (list: DubStream[]) => {
  const qOrder = (q: string) => (q.includes("1080") ? 0 : q.includes("2160") || /4k/i.test(q) ? 1 : q.includes("720") ? 2 : q.includes("Auto") ? 3 : 4);
  return list.sort((a, b) =>
    Number(b.isHls) - Number(a.isHls) ||
    Number(b.webSafe) - Number(a.webSafe) ||
    qOrder(a.quality) - qOrder(b.quality)
  );
};

/* one page of results from /api/vega (the site batches providers per
 * request - `more` = providers still pending for this title) */
async function fetchPage(type: "movie" | "tv", tmdbId: string | number, season?: number, episode?: number) {
  const q = new URLSearchParams({ type, tmdb: String(tmdbId) });
  if (type === "tv") { q.set("season", String(season ?? 1)); q.set("episode", String(episode ?? 1)); }
  try {
    const r = await fetch(`/api/vega?${q.toString()}`, { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => null);
    const s: any[] = j?.streams ?? [];
    const chips: VegaChip[] = Array.isArray(s) ? s.filter((c) => c?.link) : [];
    return { chips, more: typeof j?.more === "number" ? (j.more as number) : 0 };
  } catch {
    return { chips: [] as VegaChip[], more: 0 };
  }
}

/* full load: paint the first page instantly, then silently top up
 * with the remaining provider batches (max 6 passes) */
export async function fetchDubStreams(
  type: "movie" | "tv",
  tmdbId: string | number,
  season?: number,
  episode?: number,
  onPartial?: (streams: DubStream[]) => void
): Promise<DubStream[]> {
  const { chips, more } = await fetchPage(type, tmdbId, season, episode);
  let acc = chips.map(toDub);
  if (!acc.length && !more) return [];
  if (onPartial && acc.length) onPartial(sortChips([...acc]));

  let remaining = more;
  for (let pass = 0; remaining > 0 && pass < 6; pass++) {
    const next = await fetchPage(type, tmdbId, season, episode);
    remaining = next.more;
    const seen = new Set(acc.map((d) => d.url));
    const fresh = next.chips.map(toDub).filter((d) => !seen.has(d.url));
    if (fresh.length) {
      acc = [...acc, ...fresh];
      onPartial?.(sortChips([...acc]));
    }
  }
  return sortChips(acc);
}


