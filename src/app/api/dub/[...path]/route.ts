/* Server-side proxy for the WebStreamrMBG stream addon (FOSS Stremio
 * addon - github.com/newman2x/WebStreamrMBG) used by the "Multi Dub"
 * server. Proxied through our API so the browser/exe never hits CORS
 * and the addon URL stays swappable in one place.
 * Routes: /api/dub/stream/movie/tmdb:{id}.json
 *         /api/dub/stream/series/tmdb:{id}:{s}:{e}.json  (path passthrough) */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UPSTREAM = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = new URL(req.url);
  const target = `${UPSTREAM}/${path.map(encodeURIComponent).join("/")}${url.search}`;
  try {
    const r = await fetch(target, {
      headers: { "user-agent": "Mozilla/5.0 (Yetflix)", accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
    });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "addon unreachable" }, { status: 502 });
  }
}
