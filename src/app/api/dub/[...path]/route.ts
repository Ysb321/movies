/* Multi Dub sources - HdHub addon (hdhub.thevolecitor.qzz.io).
 * Hindi/English dual-audio files on Cloudflare R2 + PixelDrain - every
 * link is DIRECT and playable as-is.
 *
 * Their tmdb: lookups are slow (they resolve TMDB->IMDb server-side
 * first), so we resolve the IMDb id ourselves via TMDB (fast) and query
 * with the tt id, which hits their cache directly. Falls back to the
 * tmdb: id if TMDB has no IMDb id.
 *
 * Successful lists are edge-cached 5 min (their signed R2 URLs live 3h);
 * empty results are never cached so a retry can find streams later. */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const HDHUB = "https://hdhub.thevolecitor.qzz.io";
const TMDB_KEY = process.env.TMDB_API_KEY ?? "f8243ad5d5cd1ef0ebe5d6c5bfcc59f2";

const hit = async (rest: string, ms: number): Promise<{ ok: boolean; body: string; count: number }> => {
  try {
    const r = await fetch(`${HDHUB}/${rest}`, {
      headers: { "user-agent": "Mozilla/5.0 (Yetflix)", accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
    });
    const body = await r.text();
    let count = 0;
    try {
      count = ((JSON.parse(body)?.streams ?? []) as any[]).filter((s) => s?.url).length;
    } catch {}
    return { ok: r.ok, body, count };
  } catch {
    return { ok: false, body: "", count: 0 };
  }
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  /* expected: stream/{movie|series}/{id}.json */
  if (path[0] !== "stream" || (path[1] !== "movie" && path[1] !== "series") || !path[2]) {
    return NextResponse.json({ streams: [] });
  }
  const kind = path[1] === "movie" ? "movie" : "tv";
  const idFile = path[2]; /* e.g. tmdb:293660.json or tmdb:125988:1:1.json */
  const m = idFile.match(/^tmdb:(\d+)((?::\d+:\d+)?)\.json$/);

  let attempts: string[] = [];
  if (m) {
    /* resolve IMDb id ourselves (fast) - HdHub's tt lookups hit their
     * cache directly; tmdb: lookups do a slow TMDB->IMDb hop first */
    let tt = "";
    try {
      const ext = await fetch(`https://api.themoviedb.org/3/${kind}/${m[1]}/external_ids?api_key=${TMDB_KEY}`, {
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      const j = await ext.json().catch(() => null);
      tt = j?.imdb_id ?? "";
    } catch {}
    if (tt) attempts.push(`stream/${path[1]}/${encodeURIComponent(`${tt}${m[2]}`)}.json`);
    attempts.push(`stream/${path[1]}/${encodeURIComponent(`tmdb:${m[1]}${m[2]}`)}.json`);
  } else {
    attempts.push(`stream/${path[1]}/${path.map(encodeURIComponent)[2]}`);
  }

  let best: { ok: boolean; body: string; count: number } = { ok: false, body: "", count: 0 };
  for (const rest of attempts) {
    const r = await hit(rest, 22000);
    if (r.count > best.count) best = r;
    if (best.count > 0) break; /* got streams - done */
  }

  if (best.count > 0) {
    return new NextResponse(best.body, {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
  }
  /* never cache empties - a retry may find streams once their scraper
   * warms up */
  return new NextResponse(best.body || JSON.stringify({ streams: [] }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
