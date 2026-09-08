/* Header-forwarding stream proxy (edge).
 * Some Multi Dub hosts (gofile: Cookie+Referer; embed CDNs: Referer)
 * reject plain browser requests, and cross-origin video needs CORS.
 * We fetch upstream with the required headers and stream the bytes
 * back same-origin. HLS playlists are rewritten so every segment and
 * key also flows through the proxy. */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const proxyUrl = (url: string, ref: string | null, cookie: string | null) => {
  const q = new URLSearchParams({ u: url });
  if (ref) q.set("r", ref);
  if (cookie) q.set("c", cookie);
  return `/api/stream-proxy?${q.toString()}`;
};

const safeUpstream = (u: string): boolean => {
  try {
    const p = new URL(u);
    if (p.protocol !== "https:" && p.protocol !== "http:") return false;
    const h = p.hostname;
    if (
      /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
      h === "[::1]" ||
      h.endsWith(".local") ||
      h.endsWith(".internal")
    )
      return false;
    return true;
  } catch {
    return false;
  }
};

/* rewrite m3u8: absolutize + re-wrap segment / variant / key URIs */
const rewritePlaylist = (text: string, upstream: URL, ref: string | null, cookie: string | null): string =>
  text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
          try {
            const abs = new URL(uri, upstream).toString();
            return `URI="${proxyUrl(abs, ref, cookie)}"`;
          } catch {
            return `URI="${uri}"`;
          }
        });
      }
      try {
        const abs = new URL(t, upstream).toString();
        return proxyUrl(abs, ref, cookie);
      } catch {
        return line;
      }
    })
    .join("\n");

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function HEAD(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const u = sp.get("u") ?? "";
  const ref = sp.get("r");
  const cookie = sp.get("c");
  if (!safeUpstream(u)) return new NextResponse("bad upstream", { status: 400 });

  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
  };
  if (ref) headers.Referer = ref;
  if (cookie) headers.Cookie = cookie;
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(u, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch {
    return new NextResponse("upstream failed", { status: 502 });
  }

  const finalUrl = new URL(upstream.url || u);
  const ct = (upstream.headers.get("content-type") ?? "").toLowerCase();
  const isPlaylist = ct.includes("mpegurl") || ct.includes("x-mpegurl") || /\.m3u8(\?|$)/i.test(finalUrl.pathname);

  const outHeaders: Record<string, string> = {
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) outHeaders[h] = v;
  }

  if (isPlaylist) {
    const text = await upstream.text();
    const rewritten = rewritePlaylist(text, finalUrl, ref, cookie);
    return new NextResponse(rewritten, {
      status: upstream.status,
      headers: { ...outHeaders, "content-type": "application/vnd.apple.mpegurl" },
    });
  }

  /* stream bytes straight through (video / subtitles / files) */
  return new NextResponse(upstream.body, { status: upstream.status, headers: outHeaders });
}
