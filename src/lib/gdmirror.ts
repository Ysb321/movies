/** GDMirror per-title embed lookup (Server 8 "GDMirror" chip).
 * Their embeds are opaque per-title tokens (pro.iqsmartgames.com/evid/{id})
 * served only via multimovies' private player AJAX, so resolution runs
 * through our /api/gdmirror route (slug -> page -> AJAX -> embed URL).
 * Results cached per title for the session. */

const cache = new Map<string, string | null>();

export async function findGDMirrorUrl(
  slug: string,
  type: "movie" | "tv",
  season = 1,
  episode = 1
): Promise<string | null> {
  const key = `${type}:${slug}:${season}:${episode}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const res = await fetch(
      `/api/gdmirror?slug=${encodeURIComponent(slug)}&type=${type}&s=${season}&e=${episode}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const url =
      typeof json?.url === "string" && json.url.startsWith("http") ? json.url : null;
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}
