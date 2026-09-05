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

/** Detect keys that were never replaced after copying .env.example */
const looksLikePlaceholder = (k: string) => !k || /^your_|^<|placeholder|xxxx/i.test(k.trim());

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const path = segments.join("/");
  if (!ALLOWED.some((p) => path.startsWith(p))) {
    return NextResponse.json({ error: "forbidden path" }, { status: 403 });
  }

  // no server key (or the .env.example placeholder is still there)? tell the
  // client immediately so it can use its public-key fallback / setup notice
  if (looksLikePlaceholder(TMDB_KEY)) {
    return NextResponse.json(
      {
        error: "no_api_key",
        fallback: true,
        hint: TMDB_KEY
          ? ".env.local still contains the example placeholder 'your_tmdb_v3_api_key' — paste your real key"
          : "Create .env.local from .env.example and set TMDB_API_KEY",
      },
      { status: 503 }
    );
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
      // forward auth failures so the UI can say "rejected key", not "no key"
      if (res.status === 401) {
        return NextResponse.json(
          { error: "tmdb_rejected_key", hint: "TMDB returned 401 — check the key value in .env.local" },
          { status: 401 }
        );
      }
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
