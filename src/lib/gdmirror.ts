/** GDMirror per-title embed lookup (Server 8 "GDMirror" chip).
 * Their embeds are opaque per-title tokens (pro.iqsmartgames.com/evid/{id})
 * served only via multimovies' private player AJAX, so resolution runs
 * through our /api/gdmirror route (slug -> page -> AJAX -> embed URL).
 * Successes cached per title for the session; failures stay uncached so a
 * retry (Start over / re-pick) always re-attempts. `detail` carries the
 * resolver's failure stage so the UI can say WHY it failed. */

export type GDMirrorResult = { url: string | null; detail?: string };

const cache = new Map<string, GDMirrorResult>();

export async function findGDMirrorUrl(
  slug: string,
  type: "movie" | "tv",
  season = 1,
  episode = 1
): Promise<GDMirrorResult> {
  const key = `${type}:${slug}:${season}:${episode}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const fail = (detail: string): GDMirrorResult => {
    console.error(`[gdmirror] ${key}: ${detail}`);
    return { url: null, detail };
  };
  try {
    const res = await fetch(
      `/api/gdmirror?slug=${encodeURIComponent(slug)}&type=${type}&s=${season}&e=${episode}`
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return fail(
        typeof json?.error === "string" ? json.error : `resolver http ${res.status}`
      );
    }
    const url =
      typeof json?.url === "string" && json.url.startsWith("http") ? json.url : null;
    if (!url) {
      return fail(
        typeof json?.error === "string" ? json.error : "bad resolver response"
      );
    }
    const ok = { url, detail: undefined };
    cache.set(key, ok);
    return ok;
  } catch {
    return fail("resolver unreachable");
  }
}
