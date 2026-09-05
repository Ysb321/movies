/** Streaming embed providers.
 *  All accept IMDb ids (tt…) and most TMDB numeric ids; IMDb ids resolve to
 *  richer source indexes, so the watch page passes imdb_id when available. */

export type EmbedProvider = {
  id: string;
  name: string;
  movie: (id: string) => string;
  tv: (id: string, season: number, episode: number) => string;
  supportsStartAt?: boolean;
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
    supportsStartAt: true,
    movie: (id) => `https://vidcore.io/movie/${id}${qs({ autoPlay: "true", theme: "E50914" })}`,
    tv: (id, s, e) => `https://vidcore.io/tv/${id}/${s}/${e}${qs({ autoPlay: "true", theme: "E50914" })}`,
  },
  {
    id: "vidcore2",
    name: "VidCore 2",
    movie: (id) => `https://vidcore.org/embed/movie/${id}${qs({ autoplay: "true" })}`,
    tv: (id, s, e) => `https://vidcore.org/embed/tv/${id}/${s}/${e}${qs({ autoplay: "true" })}`,
  },
  {
    id: "vidsrc",
    name: "VidSrc",
    movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidsrc2",
    name: "VidSrc 2",
    movie: (id) => `https://vidsrc.hair/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.hair/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidsrc3",
    name: "VidSrc 3",
    movie: (id) => `https://vid-src.top/embed/movie/${id}`,
    tv: (id, s, e) => `https://vid-src.top/embed/tv/${id}/${s}/${e}`,
  },
];

export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

export function embedUrl(
  provider: EmbedProvider,
  type: "movie" | "tv",
  id: number | string,
  opts: { s?: number; e?: number; startAt?: number } = {}
) {
  const startAt = provider.supportsStartAt && opts.startAt && opts.startAt > 5 ? opts.startAt : undefined;
  const base =
    type === "movie"
      ? provider.movie(String(id))
      : provider.tv(String(id), opts.s ?? 1, opts.e ?? 1);
  if (!startAt) return base;
  return `${base}${base.includes("?") ? "&" : "?"}startAt=${Math.floor(startAt)}`;
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
 * VidCore emits player events from the iframe (vidcore:play / vidcore:pause /
 * vidcore:ended, and PLAYER_EVENT payloads with current time + duration).
 * Shapes vary, so we defensively deep-scan the payload for time fields. */

export type PlayerTime = { time: number; duration?: number; ended?: boolean; paused?: boolean };

const TIME_KEYS = ["currentTime", "current_time", "currenttime", "time", "position", "progress", "seconds", "elapsed"];
const DURATION_KEYS = ["duration", "totalDuration", "total_duration", "length"];

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

/** Extract playback time from a postMessage event, if it is one */
export function parsePlayerEvent(event: MessageEvent): PlayerTime | null {
  if (typeof event.origin === "string" && !event.origin.includes("vidcore")) return null;
  const data: any = event.data;
  if (!data || typeof data !== "object") return null;
  const str = JSON.stringify(data).toLowerCase();
  if (!str.includes("vidcore") && !str.includes("player") && !str.includes("time") && !str.includes("progress"))
    return null;
  const parsed = scan(data);
  return parsed.time !== undefined ? (parsed as PlayerTime) : null;
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};
