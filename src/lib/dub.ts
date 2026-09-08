/** "Multi Dub" sources - CloudStream (cs3) provider ports
 * (vegamovies / moviesdrive / moviesmod from the Megix repo, hdhub4u
 * + 4khdhub from Phisher, moviezwap from CNC-Verse). Every link is a
 * DIRECT download url - tapping a chip opens it in VLC (PC + phone);
 * the desktop exe spawns vlc.exe directly with host headers. */

export type DubStream = {
  url: string; // DIRECT link (VLC-ready)
  quality: string; // "1080p" | "2160p" | ...
  langs: string[]; // ["Hindi", "English"]
  size: string; // "2.6GB"
  host: string; // provider · server (VegaMovies · FSL)
  codecNote: string;
  isHls: boolean;
  webSafe: boolean; // mp4/m3u8 - also playable in the in-app player
  isDirect?: boolean; // always true
  codec: string;
  headers?: Record<string, string>;
  subs?: { title: string; language: string; uri: string; type: string }[];
};

const LANG_WORDS: [RegExp, string][] = [
  [/hindi|\bhin\b|\bhi\b/i, "Hindi"], [/english|eng\b|\ben\b/i, "English"], [/tamil/i, "Tamil"],
  [/telugu/i, "Telugu"], [/malayalam/i, "Malayalam"], [/punjabi/i, "Punjabi"],
  [/gujarati/i, "Gujarati"], [/korean/i, "Korean"], [/dual/i, "Dual"],
];

type CsChip = {
  provider: string; server: string; link: string;
  quality: string; size: string; title: string;
};

const toDub = (c: CsChip): DubStream => {
  const blob = `${c.server} ${c.title}`;
  let langs = LANG_WORDS.filter(([re]) => re.test(blob)).map(([, l]) => l);
  if (!langs.length) langs = ["—"];
  const isHls = /\.m3u8(\?|$)/i.test(c.link);
  const isFile = /\.(mp4|webm)(\?|$)/i.test(c.link) || isHls;
  return {
    url: c.link,
    quality: c.quality || (/2160|4k/i.test(blob) ? "2160p" : /1080/i.test(blob) ? "1080p" : /720/i.test(blob) ? "720p" : "Auto"),
    langs,
    size: c.size ?? "",
    host: `${c.provider} · ${c.server}`,
    codecNote: "",
    isHls,
    webSafe: isFile,
    isDirect: true,
    codec: /hevc|x265|10bit/i.test(blob) ? "HEVC" : "H.264",
  };
};

const sortChips = (list: DubStream[]) => {
  const rank = (q: string) => (/2160|4k/i.test(q) ? 4 : /1080/.test(q) ? 3 : /720/.test(q) ? 2 : /480/.test(q) ? 1 : 0);
  return list.sort((a, b) =>
    Number(b.webSafe) - Number(a.webSafe) || rank(b.quality) - rank(a.quality)
  );
};

async function fetchPage(type: "movie" | "tv", tmdbId: string | number, season?: number, episode?: number) {
  const q = new URLSearchParams({ type, tmdb: String(tmdbId) });
  if (type === "tv") { q.set("season", String(season ?? 1)); q.set("episode", String(episode ?? 1)); }
  try {
    const r = await fetch(`/api/dub?${q.toString()}`, { headers: { accept: "application/json" } });
    const j = await r.json().catch(() => null);
    const s: any[] = j?.streams ?? [];
    const chips: CsChip[] = Array.isArray(s) ? s.filter((c) => c?.link) : [];
    return { chips, more: typeof j?.more === "number" ? (j.more as number) : 0 };
  } catch {
    return { chips: [] as CsChip[], more: 0 };
  }
}

/* full load: paint the first provider batch instantly, then silently
 * top up with the remaining batches (site mode) */
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
  for (let pass = 0; remaining > 0 && pass < 4; pass++) {
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
