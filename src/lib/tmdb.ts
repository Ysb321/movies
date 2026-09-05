/* ── TMDB data layer ────────────────────────────────────────────────────────
 * Strategy (mirrors how NetOut on Cloudflare Pages works, plus a backend):
 *   1. Try our backend proxy /api/tmdb/... (key stays server-side, HTTP-cached)
 *   2. If the proxy is unreachable (offline sandbox, static hosting…), fall
 *      back to calling TMDB directly from the browser with the public key.
 * A sticky flag makes the switch instant after the first failure.
 * ──────────────────────────────────────────────────────────────────────────── */

export const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY ?? "";
export const TMDB_BASE = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p";

export type Media = {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  profile_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  popularity?: number;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: any[];
  credits?: any;
  videos?: any;
  images?: any;
  similar?: any;
  recommendations?: any;
  homepage?: string;
  tagline?: string;
  status?: string;
  original_language?: string;
  production_companies?: any[];
  networks?: any[];
  last_episode_to_air?: any;
  next_episode_to_air?: any;
  known_for_department?: string;
  known_for?: Media[];
};

export const titleOf = (m?: Media | null) =>
  m?.title || m?.name || m?.original_title || m?.original_name || "Untitled";

export type { ProgressItem, ListItem } from "./storage";

export const yearOf = (m?: Media | null) => {
  const d = m?.release_date || m?.first_air_date || "";
  return d ? d.slice(0, 4) : "";
};

export const typeOf = (m: Media): "movie" | "tv" =>
  m.media_type === "tv" || m.media_type === "person"
    ? "tv"
    : m.media_type === "movie"
      ? "movie"
      : !!m.first_air_date || !!m.name
        ? "tv"
        : "movie";

export const img = (path?: string | null, size = "w500") =>
  path ? `${IMG}/${size}${path}` : null;

let proxyDown = false;

async function tmdbFetch(path: string, params: Record<string, string | number | undefined> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));

  // 1) backend proxy
  if (!proxyDown) {
    try {
      const res = await fetch(`/api/tmdb/${path}?${qs}`, { headers: { accept: "application/json" } });
      if (res.status === 503) proxyDown = true; // upstream unreachable → go direct
      else if (res.ok) return res.json();
      else if (res.status >= 500) proxyDown = true;
    } catch {
      proxyDown = true;
    }
  }

  // 2) direct browser → TMDB (NetOut-style static deployment path)
  if (TMDB_KEY) {
    qs.set("api_key", TMDB_KEY);
    const res = await fetch(`${TMDB_BASE}/${path}?${qs}`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return res.json();
  }
  throw new Error("TMDB unavailable: no API key configured");
}

/* SWR fetcher with a persistent snapshot cache — revisit = instant paint,
 * revalidate in background. This is what kills "buffering" on scroll-back. */
const memorySnapshots = new Map<string, any>();

export function primeCache(key: string, data: any) {
  if (data === undefined) return;
  memorySnapshots.set(key, data);
}

export function getCached(key: string) {
  if (memorySnapshots.has(key)) return { data: memorySnapshots.get(key) };
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`tmdbcache:${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        memorySnapshots.set(key, parsed);
        return { data: parsed };
      }
    } catch {}
  }
  return {};
}

function persistSnapshot(key: string, data: any) {
  if (data === undefined || data === null) return;
  memorySnapshots.set(key, data);
  if (typeof window !== "undefined" && memorySnapshots.size < 400) {
    try {
      localStorage.setItem(`tmdbcache:${key}`, JSON.stringify(data));
    } catch {
      // storage full → prune old snapshots
      try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("tmdbcache:"));
        keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
  }
}

const inflight = new Map<string, Promise<any>>();
function deduped(key: string, fn: () => Promise<any>) {
  if (!inflight.has(key)) {
    const p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key)!;
}

export function swrFetcher(key: string): Promise<any> {
  return deduped(key, async () => {
    const [path, qs] = key.split("?");
    const params: Record<string, string> = {};
    if (qs) new URLSearchParams(qs).forEach((v, k) => (params[k] = v));
    const data = await tmdbFetch(path, params);
    // fire-and-forget persistence (never block paint)
    queueMicrotask(() => persistSnapshot(key, data));
    return data;
  });
}

export { tmdbFetch };

/* Convenience typed helpers */
export const getTrending = (type: "movie" | "tv", window: "day" | "week" = "week", page = 1) =>
  swrFetcher(`trending/${type}/${window}?page=${page}`);

export const searchMulti = (query: string, page = 1) =>
  swrFetcher(`search/multi?query=${encodeURIComponent(query)}&include_adult=false&page=${page}`);

export const getDetails = (type: "movie" | "tv", id: string | number) =>
  swrFetcher(
    `${type}/${id}?append_to_response=credits,videos,similar,recommendations,images` +
      `&include_image_language=en,null`
  );
