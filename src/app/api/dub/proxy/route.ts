/* Media streaming proxy for PenguPlay links.
 *
 * Why: hls.js fetches playlists/segments with fetch() and pengu.uk does
 * not send CORS headers -> every HLS chip just buffered forever. MP4s
 * also route better through Cloudflare's backbone than user->pengu.
 *
 * Everything plays same-origin through here:
 *  - m3u8 playlists: segment/variant/key URIs are rewritten to this
 *    proxy (relative URLs resolved against the FINAL upstream URL,
 *    redirects included)
 *  - media (mp4/mkv/ts): streaming passthrough with Range forwarded so
 *    MP4s stay seekable (206 responses preserved)
 * Only https://pengu.uk/... URLs are allowed - not an open proxy. */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const ALLOWED = "https://pengu.uk/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  /* hard gate: pengu.uk only, https only */
  if (!target.href.startsWith(ALLOWED)) return new NextResponse("forbidden", { status: 403 });

  const headers: Record<string, string> = { "user-agent": UA, accept: "*/*" };
  const range = req.headers.get("range");
  if (range) headers.range = range;

  let upstream: Response;
  try {
    /* NOTE: no timeout - the body streams for the whole playback; the
     * player/hls.js own their own retries and CF kills dead sockets */
    upstream = await fetch(target.href, { headers, redirect: "follow", cache: "no-store" });
  } catch {
    return new NextResponse("upstream unreachable", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse(`upstream ${upstream.status}`, { status: upstream.status });
  }

  const ctype = upstream.headers.get("content-type") ?? "";
  const isPlaylist =
    /mpegurl|x-m3u/i.test(ctype) || /\.m3u8(\?|$)/i.test(upstream.url) || /\.m3u8(\?|$)/i.test(target.pathname);

  if (isPlaylist) {
    const text = await upstream.text();
    const base = upstream.url; /* final URL after redirects */
    const wrap = (u: string): string => {
      try {
        const abs = new URL(u, base).href;
        return abs.startsWith(ALLOWED) ? `/api/dub/proxy?u=${encodeURIComponent(abs)}` : u;
      } catch {
        return u;
      }
    };
    const out = text
      .split("\n")
      .map((line) => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith("#")) {
          /* rewrite URI="..." attributes (EXT-X-KEY / MAP / MEDIA / I-FRAME...) */
          return line.replace(/URI="([^"]+)"/g, (_m, u: string) => `URI="${wrap(u)}"`);
        }
        return wrap(t);
      })
      .join("\n");
    return new NextResponse(out, {
      status: 200,
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*",
      },
    });
  }

  /* binary passthrough - stream the body straight through the edge */
  const h = new Headers();
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(k);
    if (v) h.set(k, v);
  }
  h.set("cache-control", "public, max-age=300");
  h.set("access-control-allow-origin", "*");
  return new NextResponse(upstream.body, { status: upstream.status, headers: h });
}
