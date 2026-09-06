/** Streaming embed providers (shown to users as generic "Server 1/2/..." —
 *  brand names are never displayed).
 *  - VidZee: player.vidzee.wtf/embed/movie/{tmdb} + /embed/tv/{tmdb}/{s}/{e}
 *    (both verified live). No URL params documented.
 *  - CineSrc: cinesrc.st/embed/movie/{tmdb} and query-style
 *    /embed/tv/{tmdb}?s={s}&e={e} (docs + both verified live). Supports
 *    ?t={seconds} start time (resume), autonext/auto-skip intros.
 *  - Peachify: peachify.top/embed/movie/{tmdb} + /embed/tv/{tmdb}/{s}/{e}
 *    (verified live). ?startAt= resume, autoNext, multi-source fallback.
 *    Anti-sandbox detection: MUST run unsandboxed; popups revoked via
 *    Permissions-Policy instead (denyPopups flag).
 *  - BingeR: bingr.one/watch/movie/{tmdb} + /watch/tv/{tmdb}/{s}/{e}
 *    (both verified live). Full site wrapping the FilmU multi-source
 *    engine (FilmU/Videasy/Cinezo/Vidbolt/Vidrift), subtitles, TV
 *    auto-next; noScroll crops their page chrome. Anti-sandbox ->
 *    unsandboxed + popups revoked; fullscreen denied (auto-fullscreen
 *    on play was removed at user request and stays removed).
 *  - MegaPlay: megaplay.buzz/stream/ani/{anilistId}/{ep}/{sub|dub} - the
 *    anime-only server ("Anime 1" pill); AniList id resolved from the TMDB
 *    title at watch time (src/lib/anilist.ts). Embed-only on their side;
 *    their player rejects the sandbox attr -> unsandboxed + popups
 *    revoked, same as the other anti-sandbox players.
 *  - PVRPlay: pvrplay.online/watch/movie/{tmdb} + /watch/tv/{tmdb}/{s}/{e}
 *    (both resolve live). Full streaming SITE rather than an embed API - no
 *    customization params, their page chrome shows inside the frame, and
 *    framing permission is not guaranteed (Electron strips any frame-block
 *    headers via FRAME_HOSTS; on the open web it depends on their headers).
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
  /** add "popups 'none'" to the iframe Permissions-Policy - for unsandboxed
   *  providers (anti-sandbox players) so window.open dies without needing
   *  the sandbox attribute they reject. */
  denyPopups?: boolean;
  /** only show this provider on anime titles (watch page filters the pills) */
  animeOnly?: boolean;
  /** pill label override (default "Server N") */
  label?: string;
  /** drop "fullscreen" from the iframe allow list - for players that
   *  auto-fullscreen the moment you press play; the Fullscreen API is
   *  denied to that frame entirely so playback stays inline. */
  denyFullscreen?: boolean;
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
    /* unsandboxed + popups revoked: their player rejects any sandbox, so
     * popup ads are killed via Permissions-Policy instead */
    denyPopups: true,
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
    id: "bingr",
    name: "BingeR",
    /* verified live: bingr.one/watch/movie/{tmdb} + /watch/tv/{tmdb}/{s}/{e}.
     * Full site with an integrated multi-source player (FilmU engine;
     * FilmU/Videasy/Cinezo/Vidbolt/Vidrift backends), subtitles, TV
     * auto-next + built-in episode list. noScroll: their page has content
     * below the player - crop it like PVRPlay so the iframe never shows
     * its own scrollbar or swallows wheel events. */
    noScroll: true,
    /* their FilmU engine shows "Playback blocked" under ANY sandbox
     * (same anti-sandbox class as Peachify) - must run unsandboxed.
     * Popup ads are still killed: "popups 'none'" on the iframe
     * Permissions-Policy + in the exe the EasyList blocker and the
     * deny-all window.open guard on every frame. */
    denyPopups: true,
    /* RESTORED by user request (FilmU-direct embed undone); the
     * no-auto-fullscreen fix stays: fullscreen is denied to this frame
     * so the player can't takeover on play. */
    denyFullscreen: true,
    sandbox: false,
    movie: (id) => `https://bingr.one/watch/movie/${id}`,
    tv: (id, s, e) => `https://bingr.one/watch/tv/${id}/${s}/${e}`,
  },
  {
    id: "pvrplay",
    name: "PVRPlay",
    /* full site: their page scrollbar + wheel capture breaks host scrolling */
    noScroll: true,
    movie: (id) => `https://pvrplay.online/watch/movie/${id}`,
    tv: (id, s, e) => `https://pvrplay.online/watch/tv/${id}/${s}/${e}`,
  },
  {
    id: "megaplay",
    name: "MegaPlay",
    /* anime-only server (pill label: "Anime 1", shown only on anime
     * titles - the watch page filters the pills). Full HiAnime-library
     * embed (megaplay.buzz/api). TMDB carries no AniList ids, so the
     * watch page resolves the title via AniList GraphQL search and builds
     * /stream/ani/{anilistId}/{ep}/sub itself - the stubs below are never
     * called. Direct navigation is disabled on their side: embed-only,
     * which is exactly our use. */
    animeOnly: true,
    label: "Anime 1",
    /* their player hard-rejects the sandbox attribute ("Opss! Sandboxed
     * our player is not allowed. Remove sandbox to use it.") ->
     * unsandboxed + popups revoked, same treatment as Peachify/BingeR. */
    denyPopups: true,
    sandbox: false,
    movie: () => "",
    tv: () => "",
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
const PLAYER_HOSTS = ["vidzee", "cinesrc", "peachify", "bingr", "pvrplay", "megaplay"];
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
