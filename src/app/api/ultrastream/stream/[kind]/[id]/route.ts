import { NextRequest, NextResponse } from "next/server";
import { resolveUltraStream } from "@/lib/ultrastream";

/* UltraStream (Server 14) - the newhdmovie2 "Ultra Stream" players as a
 * lane. TV id shape matches the castle/moviesmod lanes:
 * /series/{tmdb}:{season}:{episode}?title=. Returns the same JSON
 * contract HindiSources expects
 * ({title, streams[], captions[], noSource?, laneError?, diag?}).
 * Failures return 200 + laneError (with diag) so the UI shows the stage
 * that broke instead of a bare network error. */

export const runtime = "edge";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;
  if ((kind !== "movie" && kind !== "series") || !/^[\d:]+$/.test(id || "")) {
    return NextResponse.json({ error: "forbidden", streams: [], captions: [] }, { status: 403 });
  }
  const q = req.nextUrl.searchParams;
  const title = (q.get("title") || "").slice(0, 200);
  const year = (q.get("year") || "").slice(0, 4);
  if (!title) {
    return NextResponse.json({ error: "no title", streams: [], captions: [] }, { status: 403 });
  }
  try {
    const [tmdb, s, e] = id.split(":");
    if (!/^\d+$/.test(tmdb || "")) throw new Error("bad id");
    const out = await resolveUltraStream({
      title,
      year: year || undefined,
      kind,
      season: kind === "series" ? Math.max(1, Number(s) || 1) : 1,
      episode: kind === "series" ? Math.max(1, Number(e) || 1) : 1,
    });
    return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ultrastream failed";
    return NextResponse.json(
      { title: "", streams: [], captions: [], laneError: msg.slice(0, 160), diag: `ultrastream: ${msg}` },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
