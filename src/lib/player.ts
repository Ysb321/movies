/** Streaming embed providers.
 *  vidcore.io/org index by IMDb id (preferred when TMDB has one);
 *  videasy is TMDB-native. All are user-selectable fallback servers. */

export type EmbedProvider = {
  id: string;
  name: string;
  /** prefer IMDb id (via TMDB external_ids) when available */
  prefersImdb?: boolean;
  /** query param name that sets the start time in seconds, if supported */
  startParam?: string;
  movie: (id: string) => string;
  tv: (id: string, season: number, episode: number) => string;
};

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const PROVIDERS: EmbedProvider[] = [
  {
    id: "vidcore",
    name: "VidCore",
    prefersImdb: true,
    startParam: "startAt",
    movie: (id) => `https://vidcore.io/movie/${id}${qs({ autoPlay: "true", theme: "E50914" })}`,
    tv: (id, s, e) => `https://vidcore.io/tv/${id}/${s}/${e}${qs({ autoPlay: "true", theme: "E50914" })}`,
  },
  {
    id: "vidcore2",
    name: "VidCore 2",
    prefersImdb: true,
    movie: (id) => `https://vidcore.org/embed/movie/${id}${qs({ autoplay: "true" })}`,
    tv: (id, s, e) => `https://vidcore.org/embed/tv/${id}/${s}/${e}${qs({ autoplay: "true" })}`,
  },
  {
    id: "videasy",
    name: "Videasy",
    movie: (id) => `https://player.videasy.to/movie/${id}${qs({ color: "E50914", overlay: "true" })}`,
    tv: (id, s, e) =>
      `https://player.videasy.to/tv/${id}/${s}/${e}${qs({
        color: "E50914",
        overlay: "true",
        nextEpisode: "true",
        episodeSelector: "true",
      })}`,
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

/** legacy helper (VidCore default) */
export function vidcoreUrl(
  type: "movie" | "tv",
  id: number | string,
  opts: { s?: number; e?: number; startAt?: number } = {}
) {
  return embedUrl(PROVIDERS[0], type, id, opts);
}

/* ── Player postMessage events ──────────────────────────────────────────────
 * VidCore emits PLAYER_EVENT payloads (object) with time + duration.
 * Videasy sends a JSON *string* with { timestamp, duration, progress % }.
 * Shapes vary, so we defensively deep-scan for time fields. NB: "progress"
 * is a percentage on Videasy, so it is deliberately NOT treated as seconds. */

export type PlayerTime = { time: number; duration?: number; ended?: boolean; paused?: boolean };

const TIME_KEYS = [
  "currentTime", "current_time", "currenttime", "timestamp", "time", "position", "seconds", "elapsed",
];
const DURATION_KEYS = ["duration", "totalDuration", "total_duration", "length"];
const PLAYER_HOSTS = ["vidcore", "videasy"];

function scan(obj: unknown, depth = 0): Partial<PlayerTime> {
  if (!obj || typeof obj !== "object" || depth > 3) return {};
  const out: Partial<PlayerTime> = {};
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    const kl = k.toLowerCase();
    if (TIME_KEYS.includes(kl) && typeof v === "number" && v >= 0 && out.time === undefined) out.time = v;
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
