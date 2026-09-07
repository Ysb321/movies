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
  isDirect?: boolean;   // playable as-is (PenguPlay proxied links)
  codec: string;        // "H.264" (light) | "HEVC" (needs hw decode / strong CPU)
};

const LANG_WORDS: [RegExp, string][] = [
  [/hindi/i, "Hindi"], [/english|eng\b/i, "English"], [/tamil/i, "Tamil"],
  [/telugu/i, "Telugu"], [/malayalam/i, "Malayalam"], [/punjabi/i, "Punjabi"],
  [/gujarati/i, "Gujarati"], [/korean/i, "Korean"], [/dual/i, "Dual"],
  [/german|deutsch/i, "German"], [/spanish|espa\u00f1ol|castellano/i, "Spanish"],
  [/french|fran\u00e7ais/i, "French"], [/italian|italiano/i, "Italian"],
  [/albanian|shqip/i, "Albanian"],
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
    /* PenguPlay carries everything in `description` (name/description
     * fields), WebStreamr used `title` - read both for accurate labels */
    const title: string = s.title ?? s.description ?? "";
    const blob = `${name}\n${title}`;

    /* PenguPlay: name/description carry everything (verified live):
     *   name: "PenguPlay 4K - 2Peckle"   description: "... 1080p - MP4 ...
     *   Source: 2Peckle ... 2.89 GB ... Audio: English, Hindi" */
    const isPengu = /pengu\.uk/i.test(s.url);
    const quality = isPengu
      ? (/4K/i.test(blob) && !/\d{3,4}p/.test(blob) ? "2160p" : (blob.match(/(\d{3,4}p)/) ?? [])[1] ?? (/4K/i.test(blob) ? "2160p" : "SD"))
      : (name.match(/(\d{3,4}p)/) ?? [])[1] ?? (title.match(/(4K|2160p|1080p|720p|480p)/i) ?? [])[1] ?? "SD";
    let langs: string[] = [];
    const audioLine = (title.match(/\ud83c\udfa7 Audio: ([^\n]+)/) ?? [])[1];
    if (audioLine) langs = audioLine.split(/,\s*/).filter(Boolean);
    if (!langs.length) langs = LANG_WORDS.filter(([re]) => re.test(blob)).map(([, l]) => l);
    if (!langs.length) langs.push("—");
    const size = pick(/💾 ([\d.]+ ?[GM]B)/, title) ?? "";
    const host = isPengu ? (pick(/🛰️ Source: ([^\n]+)/, title) ?? "PenguPlay") : (pick(/🔗 (.+)$/, title) ?? "");
    const dolby = /DDP|DD\+|Dolby|EAC3|AC-?3|TrueHD|DTS/i.test(blob);
    const hevc = /HEVC|x265|10bit/i.test(blob);
    const isHls = /\.m3u8(\?|$)/i.test(s.url) || /\/hls\//i.test(s.url);
    const mkv = /\.mkv|\bMKV\b/i.test(blob);
    const webSafe = isHls || (!dolby && !mkv);
    out.push({
      url: s.url,
      quality, langs, size, host,
      codec: hevc ? "HEVC" : "H.264",
      codecNote: dolby ? "Dolby audio may be silent in-browser" : mkv && !isPengu ? "MKV container" : hevc ? "HEVC needs a modern PC" : "",
      isHls, webSafe,
      isDirect: isPengu,
    });
  }

  /* sort: web-safe first, then SMOOTHNESS (H.264 1080p leads - light
   * decode on any PC; HEVC and >1080p sink, they need hardware decode
   * or a strong CPU and stutter on low-end machines), then quality */
  const qOrder = (q: string) => (q.includes("1080") ? 0 : q.includes("2160") || /4k/i.test(q) ? 1 : q.includes("720") ? 2 : 3);
  const sizeNum = (s: string) => parseFloat(s) || 0;
  const hgt = (q: string) => parseInt(q, 10) || 0;
  const smooth = (d: DubStream) => (d.codec === "HEVC" ? 10 : 0) + (hgt(d.quality) > 1080 ? 1 : 0);
  return out.sort((a, b) =>
    Number(b.isDirect ?? false) - Number(a.isDirect ?? false) ||
    Number(b.webSafe) - Number(a.webSafe) ||
    smooth(a) - smooth(b) ||
    qOrder(a.quality) - qOrder(b.quality) ||
    sizeNum(a.size) - sizeNum(b.size)
  );
}
