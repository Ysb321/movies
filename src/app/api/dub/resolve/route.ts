/* Resolves WebStreamrMBG extract endpoints to the final DIRECT file URL.
 * The addon's /extract/ links redirect server-side (addon -> hubcloud ->
 * file host), so one redirect-following fetch lands on the playable URL
 * (verified live: extract URL 302s straight to the .mkv/.mp4). Gated to
 * the WebStreamrMBG addon only - not an open proxy. */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const WSMBG = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club/";

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  if (!u.startsWith(WSMBG)) return NextResponse.json({ url: null, error: "forbidden" });

  try {
    const r = await fetch(u, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "*/*",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(22000),
    });
    const finalUrl = r.url;
    const ct = r.headers.get("content-type") ?? "";

    /* HubCloud generator pattern (verified live): the extract URL
     * redirects to gamerxyt.com/dl.php?link=<DIRECT googleusercontent
     * file URL> - the playable link rides in the query string */
    const lm = finalUrl.match(/[?&]link=(https?[^&#]+)/);
    if (lm) {
      let link = lm[1];
      try { link = decodeURIComponent(link); } catch {}
      if (/^https?:\/\//.test(link)) return NextResponse.json({ url: link });
    }

    /* landed back on an HTML page = the host wants a manual generation
     * step (some extractors) - the player shows its generator frame */
    if (/text\/html/i.test(ct) && !/\.(mp4|mkv|m3u8|webm)/i.test(finalUrl)) {
      return NextResponse.json({ url: null, page: true, status: r.status });
    }
    if (!/^https?:\/\//.test(finalUrl)) {
      return NextResponse.json({ url: null, status: r.status });
    }
    return NextResponse.json({ url: finalUrl, status: r.status });
  } catch (e: any) {
    return NextResponse.json({ url: null, error: e?.message ?? "resolve failed" });
  }
}
