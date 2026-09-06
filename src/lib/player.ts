/** Streaming embed providers (shown to users as generic "Server 1/2/..." —
 *  brand names are never displayed).
 *  - VidZee: player.vidzee.wtf/embed/movie/{tmdb} + /embed/tv/{tmdb}/{s}/{e}
 *    (both verified live). No URL params documented.
 *  - CineSrc: cinesrc.st/embed/movie/{tmdb} and query-style
 *    /embed/tv/{tmdb}?s={s}&e={e} (docs + both verified live). Supports
 *    ?t={seconds} start time (resume), autonext/auto-skip intros.
 *  - PVRPlay: pvrplay.online/watch/movie/{tmdb} + /watch/tv/{tmdb}/{s}/{e}
 *    (both resolve live). Full streaming SITE rather than an embed API - no
 *    customization params, their page chrome shows inside the frame, and
 *    framing permission is not guaranteed (Electron strips any frame-block
 *    headers via FRAME_HOSTS; on the open web it depends on their headers).
 *    PLAYING LIVE). Iframe-first API (their tagline: point an iframe at a
 *    TMDB id), params: autoplay, autonext, color, hide. Replaced SuperEmbed
 *    whose server refuses cross-origin framing outright (403 + XFO +
 *    referer gates) - unfixable even with app-side header stripping.
 *    (docs + both verified live). ?startAt= resume, autoNext TV episode
 *    flow, multi-source smart fallback (Wolf/Spider/Multi/Iron), documented
 *    PLAYER_EVENT postMessages (currentTime/duration) that feed the
 *    existing resume tracker. NB: anti-sandbox detection - MUST run
 *    unsandboxed (see note at the provider entry).
 *  To add another server later, append an entry to PROVIDERS — the watch
 *  page shows a server switcher automatically when there is more than one. */

export type EmbedProvider = {
  id: string;
  name: string;
  /** prefer IMDb id (via TMDB external_ids) when available */
  prefersImdb?: boolean;
  /** query param name that sets the start time in seconds, if supported */
  startParam?: string;
  /** sandbox token list; overrides PLAYER_SANDBOX for this provider.
   *  false = no sandbox at all (last resort for anti-sandbox players). */
  sandbox?: false | string;
  /** render the iframe with scrolling="no" - for full-site providers whose
   *  inner page shows its own scrollbar and swallows wheel events (breaks
   *  scrolling of the host page). Inner page becomes unscrollable; wheel
   *  chains back to Yetflix. */
  noScroll?: boolean;
  movie: (id: string) => string;
  tv: (id: string, season: number, episode: number) => string;
};

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** default iframe armor: no popups, no modals, no top-navigation hijack */
export const PLAYER_SANDBOX =
  "allow-scripts allow-same-origin allow-downloads allow-forms allow-pointer-lock";

export const PROVIDERS: EmbedProvider[] = [
  {
    id: "vidzee",
    name: "VidZee",
    movie: (id) => `https://player.vidzee.wtf/embed/movie/${id}`,
    tv: (id, s, e) => `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "cinesrc",
    name: "CineSrc",
    startParam: "t",
    movie: (id) => `https://cinesrc.st/embed/movie/${id}`,
    tv: (id, s, e) => `https://cinesrc.st/embed/tv/${id}${qs({ s, e })}`,
  },
  {
    id: "peachify",
    name: "Peachify",
    startParam: "startAt",
    /* anti-sandbox detection: every sandbox token config was rejected -
     * this provider requires a fully unsandboxed iframe. Popup/top-nav
     * threats are handled OUTSIDE the iframe instead: Electron (EasyList
     * blocker + popup guard on every webContents); browsers use their own
     * popup blockers. */
    sandbox: false,
    movie: (id) => `https://peachify.top/embed/movie/${id}${qs({ color: "E50914" })}`,
    tv: (id, s, e) =>
      `https://peachify.top/embed/tv/${id}/${s}/${e}${qs({ color: "E50914", autoNext: "true" })}`,
  },
  {
    id: "vidzy",
    name: "Vidzy",
    /* hide=volume: their wheel-to-change-volume gesture swallows mouse-wheel
     * events over the player, blocking page scrolling - hiding the volume
     * control disables the gesture (documented hide param) */
    movie: (id) => `https://vidzy.org/movie/${id}${qs({ color: "E50914", autoplay: "1", hide: "volume" })}`,
    tv: (id, s, e) =>
      `https://vidzy.org/serie/${id}/${s}/${e}${qs({ color: "E50914", autoplay: "1", autonext: "1", hide: "volume" })}`,
  },
  {
    id: "pvrplay",
    name: "PVRPlay",
    /* full site: their page scrollbar + wheel capture breaks host scrolling */
    noScroll: true,
    movie: (id) => `https://pvrplay.online/watch/movie/${id}`,
    tv: (id, s, e) => `https://pvrplay.online/watch/tv/${id}/${s}/${e}`,
  },
];

export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

export function embedUrl(
  provider: EmbedProvider,
  type: "movie" | "tv",
  id: number | string,
  opts: { s?: number; e?: number; startAt?: number } = {}
) {
  const base =
    type === "movie" ? provider.movie(String(id)) : provider.tv(String(id), opts.s ?? 1, opts.e ?? 1);
  const startAt =
    provider.startParam && opts.startAt && opts.startAt > 5 ? Math.floor(opts.startAt) : undefined;
  if (!startAt) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${provider.startParam}=${startAt}`;
}

/* ── Player postMessage events ──────────────────────────────────────────────
 * CineSrc documents loadedmetadata/ended/etc events (no periodic time
 * event); VidZee documents none. The parser stays
 * generic (JSON string or object, deep time-field scan) so continue-watching
 * tracking works automatically if/when they emit them.
 * NB: "progress" (%-fields) and epoch-ms "timestamp" fields are never read
 * as playback seconds. */

export type PlayerTime = { time: number; duration?: number; ended?: boolean; paused?: boolean };

const TIME_KEYS = [
  "currentTime", "current_time", "currenttime", "time", "position", "seconds", "elapsed",
];
const DURATION_KEYS = ["duration", "totalDuration", "total_duration", "length"];
const PLAYER_HOSTS = ["vidzee", "cinesrc", "peachify", "vidzy", "pvrplay"];
/** playback seconds can never reach this; epoch-ms "timestamp" fields do */
const MAX_PLAUSIBLE_SECONDS = 1e7;

function scan(obj: unknown, depth = 0): Partial<PlayerTime> {
  if (!obj || typeof obj !== "object" || depth > 3) return {};
  const out: Partial<PlayerTime> = {};
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    const kl = k.toLowerCase();
    if (kl === "timestamp") continue; // epoch-ms, not playback time
    if (TIME_KEYS.includes(kl) && typeof v === "number" && v >= 0 && v < MAX_PLAUSIBLE_SECONDS && out.time === undefined)
      out.time = v;
    else if (DURATION_KEYS.includes(kl) && typeof v === "number" && v > 0) out.duration = v;
    else if (kl === "type" || kl === "event" || kl === "eventname") {
      const s = String(v).toLowerCase();
      if (s.includes("end") || s.includes("complete")) out.ended = true;
      if (s.includes("pause")) out.paused = true;
    } else if (typeof v === "object") {
      const nested = scan(v, depth + 1);
      if (out.time === undefined && nested.time !== undefined) out.time = nested.time;
      if (out.duration === undefined && nested.duration !== undefined) out.duration = nested.duration;
      if (nested.ended) out.ended = true;
      if (nested.paused) out.paused = true;
    }
  }
  return out;
}

/** Extract playback time from a player postMessage event, if it is one */
export function parsePlayerEvent(event: MessageEvent): PlayerTime | null {
  if (typeof event.origin === "string" && !PLAYER_HOSTS.some((h) => event.origin.includes(h))) return null;
  let data: any = event.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const parsed = scan(data);
  return parsed.time !== undefined ? (parsed as PlayerTime) : null;
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};
