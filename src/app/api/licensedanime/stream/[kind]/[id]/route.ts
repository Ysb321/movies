import { NextRequest, NextResponse } from "next/server";
import { resolveLicensedAnime, type LicensedKind } from "@/lib/licensedanime";

/* Licensed anime lane (Server 18) — resolves a TMDB title to episodes on
 * the licensors' OWN YouTube channels (Muse Asia, Ani-One Asia, Gundam
 * Channel INTL). Id shape matches the other lanes:
 *   /api/licensedanime/stream/series/{tmdb}:{season}:{episode}?title=
 *   /api/licensedanime/stream/movie/{tmdb}?title=
 * Returns {title, sources[], noSource?, laneError?, diag?}. Failures come
 * back 200 + laneError so the UI shows the stage that broke rather than a
 * bare network error, same as the castle/nuvio lanes. */

export const runtime = "edge";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;
  if ((kind !== "movie" && kind !== "series") || !/^[\d:]+$/.test(id || "")) {
    return NextResponse.json({ error: "forbidden", sources: [] }, { status: 403 });
  }
  const q = req.nextUrl.searchParams;
  const title = (q.get("title") || "").slice(0, 200);
  const altTitle = (q.get("alt") || "").slice(0, 200);
  const audioRaw = (q.get("audio") || "").toLowerCase();
  const audio: LicensedKind | undefined =
    audioRaw === "sub" || audioRaw === "dub" ? (audioRaw as LicensedKind) : undefined;
  if (!title) {
    return NextResponse.json({ error: "no title", sources: [] }, { status: 403 });
  }
  try {
    const [tmdb, s, e] = id.split(":");
    if (!/^\d+$/.test(tmdb || "")) throw new Error("bad id");
    const out = await resolveLicensedAnime({
      title,
      altTitle: altTitle || undefined,
      kind,
      season: kind === "series" ? Math.max(1, Number(s) || 1) : 1,
      episode: kind === "series" ? Math.max(1, Number(e) || 1) : 1,
      audio,
    });
    return NextResponse.json(out, {
      headers: { "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "licensed anime failed";
    return NextResponse.json(
      { title: "", sources: [], laneError: msg.slice(0, 160), diag: `licensedanime: ${msg}` },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
