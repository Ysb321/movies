/** "Multi Dub" stream sources - HdHub addon (hdhub.thevolecitor.qzz.io).
 * Hindi/English dual-audio files hosted on Cloudflare R2 + PixelDrain
 * mirrors - every URL is DIRECT and playable as-is (no generators). */

export type DubStream = {
  url: string;
  quality: string;      // "2160p" | "1080p" | ...
  langs: string[];      // ["Hindi", "English"]
  size: string;         // "8.37 GB"
  host: string;         // "FSLv2" | "PixelDrain" | ...
  codecNote: string;    // "" | "Dolby audio may be silent in-browser"
  isHls: boolean;       // .m3u8 -> hls.js (multi-audio switching)
  webSafe: boolean;     // H.264/AAC - plays everywhere with sound
  isDirect?: boolean;   // playable as-is
  codec: string;        // "H.264" (light) | "HEVC" (needs hw decode)
};

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
  const seenSizes = new Set<string>();
  for (const s of streams) {
    if (!s?.url || typeof s.url !== "string") continue; /* donation/discord/no-streams entries */
    const name: string = s.name ?? "";
    const desc: string = s.description ?? "";
    const blob = `${name}\n${desc}`;

    const quality =
      (name.match(/(\d{3,4}p)/) ?? [])[1] ??
      (desc.match(/(\d{3,4}p)/) ?? [])[1] ??
      (/4k|2160/i.test(blob) ? "2160p" : /720/i.test(blob) ? "720p" : "SD");

    let langs = LANG_WORDS.filter(([re]) => re.test(blob)).map(([, l]) => l);
    if (!langs.length) langs = ["—"];

    const size = pick(/💾 ([\d.]+ ?[GM]B)/, desc) ?? "";
    const host = pick(/\[([A-Za-z][^\]]*)\]/, desc) ?? "HdHub";
    const dolby = /DDP|DD\+|Dolby|EAC3|AC-?3|TrueHD|DTS|Atmos/i.test(blob);
    const hevc = /HEVC|x265|H\.?265|10bit/i.test(blob);
    const isHls = /\.m3u8(\?|$)/i.test(s.url);
    const mkv = /\.mkv|\bMKV\b/i.test(blob);
    const webSafe = isHls || (!dolby && !mkv);

    /* mirrors of the same encode (FSL / FSLv2 / PixelDrain) share the
     * same videoSize - keep the first (fastest-listed) only */
    const dedupeKey = String(s.behaviorHints?.videoSize ?? "") + quality + langs.join();
    if (s.behaviorHints?.videoSize && seenSizes.has(dedupeKey)) continue;
    if (s.behaviorHints?.videoSize) seenSizes.add(dedupeKey);

    out.push({
      url: s.url,
      quality, langs, size, host,
      codec: hevc ? "HEVC" : "H.264",
      codecNote: dolby ? "Dolby/DTS audio may be silent in-browser" : mkv ? "MKV container" : "",
      isHls, webSafe,
      isDirect: true,
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
