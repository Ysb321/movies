/* Server 9 (WebStreamr): Stremio-addon stream resolution + "Play in VLC"
 * handoff for every platform.
 *
 * The addon (WebStreamrMBG) scrapes 20+ source sites live and returns
 * Stremio stream objects: { url, name, title, behaviorHints }. Direct
 * entries carry an /extract/ url (resolves to the file at play time);
 * page-only entries carry externalUrl (a download-button page the user
 * must click through). All calls go through our /api/webstreamr routes
 * (no CORS gamble, one shared fetch, resolve logic server-side).
 */

export type WsStream = {
  url?: string;
  externalUrl?: string;
  name?: string;
  title?: string;
  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
    videoSize?: number;
    filename?: string;
  };
};

/** one rendered source row (parsed from the addon's name/title lines) */
export type WsRow = {
  key: string;
  /** direct (extract) url, when the entry has one */
  fileUrl?: string;
  /** download page url, when the entry is page-only */
  pageUrl?: string;
  quality: string;
  size: string;
  source: string;
  file: string;
  audio: string;
};

export const fmtSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2).replace(/\.?0+$/, "")} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(1).replace(/\.0$/, "")} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

const httpUrl = (u?: string) =>
  typeof u === "string" && /^https?:\/\//i.test(u) ? u : undefined;

/* name:  "WebStreamrMBG\n<flags>\n<quality>"
 * title: "<file> ⚠️ no seek\n💾 <size>\n🔗 <source>" */
export function parseStream(s: WsStream, i: number): WsRow {
  const nameLines = (s.name || "").split("\n").map((x) => x.trim());
  const titleLines = (s.title || "").split("\n").map((x) => x.trim());
  const quality = nameLines.length >= 3 ? nameLines[nameLines.length - 1] : "";
  const audio = nameLines.length >= 3 ? nameLines[1] : "";
  const file = (titleLines[0] || "").replace(/\s*⚠️.*$/, "").trim();
  const size =
    (titleLines.find((l) => l.startsWith("💾")) || "").replace("💾", "").trim() ||
    fmtSize(s.behaviorHints?.videoSize);
  const source = (titleLines.find((l) => l.startsWith("🔗")) || "")
    .replace("🔗", "")
    .trim();
  return {
    key: `${i}-${s.url || s.externalUrl || i}`,
    fileUrl: httpUrl(s.url),
    pageUrl: httpUrl(s.externalUrl),
    quality,
    size,
    source,
    file: file || "Unknown file",
    audio,
  };
}

/** stremio ids to try in order (IMDb first when TMDB knows it) */
export function wsIds(
  type: "movie" | "tv",
  tmdbId: string,
  imdbId: string | null,
  season: number,
  episode: number
): string[] {
  const ids: string[] = [];
  const imdb = imdbId && /^tt\d+$/.test(imdbId) ? imdbId : null;
  if (imdb) ids.push(type === "movie" ? imdb : `${imdb}:${season}:${episode}`);
  ids.push(
    type === "movie" ? `tmdb:${tmdbId}` : `tmdb:${tmdbId}:${season}:${episode}`
  );
  return ids;
}

/** streams for one stremio id (throws on addon failure/timeout) */
export async function fetchWsStreams(
  kind: "movie" | "series",
  stremioId: string,
  signal?: AbortSignal
): Promise<WsStream[]> {
  const r = await fetch(
    `/api/webstreamr/stream/${kind}/${encodeURIComponent(stremioId)}`,
    { signal }
  );
  if (!r.ok) throw new Error(`sources ${r.status}`);
  const j = (await r.json()) as { streams?: WsStream[] };
  return Array.isArray(j?.streams) ? j.streams : [];
}

export type WsResolved =
  | { ok: true; kind: "file" | "page"; url: string; links: string[]; stale?: boolean }
  | { ok: false; error: string };

/** resolve a stream url to a playable file (or a download-button page) */
export async function resolveWsUrl(url: string): Promise<WsResolved> {
  try {
    const r = await fetch(`/api/webstreamr/resolve?url=${encodeURIComponent(url)}`);
    const j = (await r.json()) as WsResolved;
    if (!j || typeof j !== "object" || !("ok" in j)) return { ok: false, error: "bad resolver reply" };
    return j;
  } catch {
    return { ok: false, error: "resolver unreachable" };
  }
}

/* ── VLC handoff ─────────────────────────────────────────────────── */

export const isDesktopVlc = () =>
  typeof window !== "undefined" &&
  !!(window as unknown as { yetflixVlc?: { play?: unknown } }).yetflixVlc?.play;

export const isAndroid = () =>
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

export const isIOS = () =>
  typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Android Chrome -> VLC app (falls back to nothing when VLC is missing,
 *  so the UI always pairs it with a copy-link fallback) */
export function vlcIntentUrl(fileUrl: string): string | null {
  if (fileUrl.startsWith("https://"))
    return `intent://${fileUrl.slice("https://".length)}#Intent;scheme=https;package=org.videolan.vlc;end`;
  if (fileUrl.startsWith("http://"))
    return `intent://${fileUrl.slice("http://".length)}#Intent;scheme=http;package=org.videolan.vlc;end`;
  return null;
}

/** VLC for iOS url scheme */
export function vlcIosUrl(fileUrl: string): string {
  return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(fileUrl)}`;
}

/** hand a direct file url to the installed VLC; on plain PC browsers there
 *  is no VLC hook, so the link is copied for VLC's Open Network Stream. */
export async function openInVlc(fileUrl: string): Promise<{ ok: boolean; note: string }> {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fileUrl);
    } catch {}
  };
  try {
    if (isDesktopVlc()) {
      let referer: string | undefined;
      try {
        referer = new URL(fileUrl).origin;
      } catch {}
      await (
        window as unknown as {
          yetflixVlc: { play: (u: string, h?: object) => Promise<unknown> };
        }
      ).yetflixVlc.play(fileUrl, referer ? { Referer: referer } : undefined);
      return { ok: true, note: "Sent to VLC ✓" };
    }
    if (isAndroid()) {
      const intent = vlcIntentUrl(fileUrl);
      if (intent) {
        window.location.href = intent;
        return { ok: true, note: "Opening VLC app… (no VLC? install it, then tap again)" };
      }
    }
    if (isIOS()) {
      window.location.href = vlcIosUrl(fileUrl);
      return { ok: true, note: "Opening VLC app… (no VLC? install it, then tap again)" };
    }
    /* PC web browser: no direct VLC hook - fire the Yetflix desktop bridge
     * (auto-opens VLC when the app is installed; silent no-op otherwise)
     * and always copy the link as well */
    try {
      let ref = "";
      try {
        ref = `&ref=${encodeURIComponent(new URL(fileUrl).origin)}`;
      } catch {}
      const f = document.createElement("iframe");
      f.style.display = "none";
      f.src = `yetflix-vlc://play?url=${encodeURIComponent(fileUrl)}${ref}`;
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 4000);
    } catch {}
    await copyLink();
    return { ok: false, note: "Opening VLC via the Yetflix app… (link copied too)" };
  } catch {
    await copyLink();
    return { ok: false, note: "VLC didn't open — link copied instead" };
  }
}
