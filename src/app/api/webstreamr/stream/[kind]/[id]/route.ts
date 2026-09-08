import { NextRequest, NextResponse } from "next/server";

/* Server 9 (WebStreamr) stream API - thin server-side passthrough to the
 * Stremio addon (host pinned below; kind + id strictly validated). Keeps
 * the browser out of CORS trouble and gives every client one shared call.
 * The addon scrapes live: responses can take up to ~90s (their Cloudflare
 * 504s past ~100s) - the UI shows progress + retry. No cache (live data).
 */

export const runtime = "edge";

const ADDON = "https://87d6a6ef6b58-webstreamrmbg-dev.baby-beamup.club";
/* India-first language pack (multi + Hindi/Tamil/Telugu dubs). Every extra
 * language costs scrape time - keep this list short. Deliberately WITHOUT
 * includeExternalUrls: that path 504s their dev server; direct /extract/
 * streams are the VLC flow anyway. */
const CONFIG = encodeURIComponent(
  JSON.stringify({ multi: "on", hi: "on", ta: "on", te: "on" })
);

const okKind = (k: string) => k === "movie" || k === "series";
const okId = (id: string) => /^(tmdb:\d+(:\d+:\d+)?|tt\d+(:\d+:\d+)?)$/.test(id);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;
  if (!okKind(kind) || !okId(id)) {
    return NextResponse.json({ error: "forbidden", streams: [] }, { status: 403 });
  }
  const upstream = `${ADDON}/${CONFIG}/stream/${kind}/${id}.json`;
  try {
    const res = await fetch(upstream, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(95000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `addon ${res.status}`, streams: [] },
        { status: res.status === 404 ? 404 : 502 }
      );
    }
    const body = await res.text();
    return new NextResponse(body, {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    const timeout = !!e && (e as Error).name === "TimeoutError";
    return NextResponse.json(
      { error: timeout ? "addon_timeout" : "addon_unreachable", streams: [] },
      { status: 504 }
    );
  }
}
