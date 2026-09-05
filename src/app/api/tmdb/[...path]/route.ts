import { NextRequest, NextResponse } from "next/server";

/* Backend TMDB proxy — keeps the API key server-side and adds HTTP caching.
 * Allowed upstream paths are allow-listed by prefix. If the server cannot
 * reach TMDB (e.g. restricted network), respond 503 + {fallback:true} so the
 * client transparently switches to direct TMDB calls. */

const ALLOWED = [
  "trending/",
  "discover/",
  "search/",
  "movie/",
  "tv/",
  "genre/",
  "list/",
  "keyword/",
  "person/",
  "find/",
];

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY ?? "";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const path = segments.join("/");
  if (!ALLOWED.some((p) => path.startsWith(p))) {
    return NextResponse.json({ error: "forbidden path" }, { status: 403 });
  }

  const search = req.nextUrl.searchParams;
  const qs = new URLSearchParams(search);
  if (TMDB_KEY) qs.set("api_key", TMDB_KEY);
  const upstream = `${TMDB_BASE}/${path}?${qs}`;

  try {
    const res = await fetch(upstream, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream ${res.status}` },
        { status: res.status === 404 ? 404 : 502 }
      );
    }
    const body = await res.text();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, s-maxage=300, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "upstream unreachable", fallback: true },
      { status: 503 }
    );
  }
}
