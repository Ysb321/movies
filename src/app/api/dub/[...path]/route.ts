/* Server-side proxy for the WebStreamrMBG stream addon (FOSS Stremio
 * addon - github.com/newman2x/WebStreamrMBG) used by the "Multi Dub"
 * server. Proxied through our API so the browser/exe never hits CORS
 * and the addon URL stays swappable in one place.
 * Routes: /api/dub/stream/movie/tmdb:{id}.json
 *         /api/dub/stream/series/tmdb:{id}:{s}:{e}.json  (path passthrough) */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages (next-on-pages requirement)

const UPSTREAM = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";

/* FULL config: every source and language the addon supports (multi =
 * 4KHDHub/HDHub4u/MovieBox/VidSrc/VidZee/VixSrc + Hindi, Tamil, Telugu,
 * Gujarati, Punjabi, Malayalam, German, Spanish, French, Italian,
 * Albanian, LatAm-Spanish) + includeExternalUrls. User ask: fetch ALL
 * links, not just the default multi-dub set. */
const FULL_CONFIG = encodeURIComponent(
  JSON.stringify({
    multi: "on", al: "on", de: "on", es: "on", fr: "on", gu: "on", hi: "on",
    it: "on", ml: "on", mx: "on", pa: "on", ta: "on", te: "on",
    includeExternalUrls: "on",
  })
);

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = new URL(req.url);
  /* stream requests go through the full-config prefix; everything else
   * (extract URLs embedded in responses) already carries its own config */
  const rest = path.map(encodeURIComponent).join("/");
  const target = path[0] === "stream" ? `${UPSTREAM}/${FULL_CONFIG}/${rest}${url.search}` : `${UPSTREAM}/${rest}${url.search}`;
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
