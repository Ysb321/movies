/** "Multi Dub" stream sources (WebStreamrMBG addon via /api/dub proxy).
 * Returns language/quality-labelled playable links (HubCloud / FSL /
 * Pixel-class file hosts + HLS when available) for the Yetflix Player. */

export type DubStream = {
  url: string;
  quality: string;      // "2160p" | "1080p" | ...
  langs: string[];      // ["Hindi", "English"]
  size: string;         // "6.45 GB"
  host: string;         // "HubCloud (10Gbps) from 4KHDHub"
  codecNote: string;    // "" | "Dolby/DTS audio may be silent in-browser"
  isHls: boolean;       // .m3u8 -> hls.js (true multi-audio switching)
  webSafe: boolean;     // H.264/AAC/MP4/HLS - plays everywhere
};

const LANG_WORDS: [RegExp, string][] = [
  [/hindi/i, "Hindi"], [/english|eng\b/i, "English"], [/tamil/i, "Tamil"],
  [/telugu/i, "Telugu"], [/malayalam/i, "Malayalam"], [/punjabi/i, "Punjabi"],
  [/gujarati/i, "Gujarati"], [/korean/i, "Korean"], [/dual/i, "Dual"],
];

function pick(re: RegExp, s: string): string | null {
  const m = s.match(re);
  return m ? m[1] : null;
}

export async function fetchDubStreams(
  type: "movie" | "tv",
  tmdbId: string | number,
  season?: number,
  episode?: number
): Promise<DubStream[]> {
  const idPath =
    type === "tv" ? `tmdb:${tmdbId}:${season ?? 1}:${episode ?? 1}` : `tmdb:${tmdbId}`;
  const res = await fetch(`/api/dub/stream/${type}/${encodeURIComponent(idPath)}.json`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  const streams: any[] = json?.streams ?? [];

  const out: DubStream[] = [];
  for (const s of streams) {
    if (!s?.url || typeof s.url !== "string") continue;
    const name: string = s.name ?? "";
    const title: string = s.title ?? "";
    const blob = `${name}\n${title}`;

    const quality = (name.match(/(\d{3,4}p)/) ?? [])[1] ?? (title.match(/(4K|2160p|1080p|720p|480p)/i) ?? [])[1] ?? "SD";
    const langs = LANG_WORDS.filter(([re]) => re.test(blob)).map(([, l]) => l);
    if (!langs.length) langs.push("—");
    const size = pick(/💾 ([\d.]+ [GM]B)/, title) ?? "";
    const host = pick(/🔗 (.+)$/, title) ?? "";
    const dolby = /DDP|DD\+|Dolby|EAC3|AC-?3|TrueHD|DTS/i.test(blob);
    const hevc = /HEVC|x265|10bit/i.test(blob);
    const isHls = /\.m3u8(\?|$)/i.test(s.url);
    const webSafe = isHls || (!dolby && !hevc);
    out.push({
      url: s.url,
      quality, langs, size, host,
      codecNote: dolby ? "Dolby audio may be silent in-browser" : hevc ? "HEVC needs a modern PC" : "",
      isHls, webSafe,
    });
  }

  /* sort: web-safe first, then 1080p sweet-spot, then smaller files */
  const qOrder = (q: string) => (q.includes("1080") ? 0 : q.includes("2160") || /4k/i.test(q) ? 1 : q.includes("720") ? 2 : 3);
  const sizeNum = (s: string) => parseFloat(s) || 0;
  return out.sort((a, b) =>
    Number(b.webSafe) - Number(a.webSafe) ||
    qOrder(a.quality) - qOrder(b.quality) ||
    sizeNum(a.size) - sizeNum(b.size)
  );
}
