/** VidCore embed (https://vidcore.io) — movie & TV endpoints
 *  movie: https://vidcore.io/movie/{id}
 *  tv:    https://vidcore.io/tv/{id}/{season}/{episode}
 *  params: autoPlay, theme, sub, poster, title, startAt (seconds), server… */

export function vidcoreUrl(
  type: "movie" | "tv",
  id: number | string,
  opts: { s?: number; e?: number; startAt?: number } = {}
) {
  const base =
    type === "movie"
      ? `https://vidcore.io/movie/${id}`
      : `https://vidcore.io/tv/${id}/${opts.s ?? 1}/${opts.e ?? 1}`;
  const qs = new URLSearchParams({ autoPlay: "true", theme: "E50914" });
  if (opts.startAt && opts.startAt > 5) qs.set("startAt", String(Math.floor(opts.startAt)));
  return `${base}?${qs.toString()}`;
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
