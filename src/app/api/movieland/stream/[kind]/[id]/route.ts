import { NextRequest, NextResponse } from "next/server";
import { resolveMovieland } from "@/lib/movieland";

/* Movieland (Server 17): AllMovieLand direct-m3u8 lane. TV id shape
 * matches the other lanes: /series/{tmdb}:{season}:{episode}?title=.
 * Returns the same JSON contract HindiSources expects
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
    const out = await resolveMovieland({
      title,
      year: year || undefined,
      kind,
      season: kind === "series" ? Math.max(1, Number(s) || 1) : 1,
      episode: kind === "series" ? Math.max(1, Number(e) || 1) : 1,
    });
    return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "movieland failed";
    return NextResponse.json(
      { title: "", streams: [], captions: [], laneError: msg.slice(0, 160), diag: `movieland: ${msg}` },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
