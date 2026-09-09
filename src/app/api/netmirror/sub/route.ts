import { NextRequest, NextResponse } from "next/server";

/* Server 19 subtitle proxy - NetMirror captions (.srt via their
 * /api/proxy/video or the MovieBox CDN) are fetched server-side and
 * re-served with CORS *, so the site player's subtitle loader never
 * trips on missing allow-origin headers. Tiny text files only: 15s
 * cap, 1h edge cache (keyed by the full signed url, so expiry is safe).
 * SSRF guard: NetMirror API host + subscdn.top subtitle CDN (+subs) +
 * MovieBox CDN suffix. */

export const runtime = "edge";

const okHost = (h: string) =>
  h === "net27.cc" ||
  h === "subscdn.top" ||
  h.endsWith(".subscdn.top") ||
  h.endsWith(".hakunaymatata.com");

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 403 });
  }
  if (url.protocol !== "https:" || !okHost(url.hostname)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return NextResponse.json({ error: `sub ${res.status}` }, { status: 502 });
    const body = await res.text();
    if (!body || body.length > 2_000_000) {
      return NextResponse.json({ error: "bad sub" }, { status: 502 });
    }
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "sub unreachable" }, { status: 504 });
  }
}
