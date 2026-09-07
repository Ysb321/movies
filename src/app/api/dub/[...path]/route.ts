/* Server-side proxy for the WebStreamrMBG stream addon (FOSS Stremio
 * addon - github.com/newman2x/WebStreamrMBG) used by the "Multi Dub"
 * server. Proxied through our API so the browser/exe never hits CORS
 * and the addon URL stays swappable in one place.
 * Routes: /api/dub/stream/movie/tmdb:{id}.json
 *         /api/dub/stream/series/tmdb:{id}:{s}:{e}.json  (path passthrough)
 *
 * CF Pages functions hard-timeout (~30s) on the FULL config (all 14
 * languages make the addon scrape ~20 sites - 504 observed live), so
 * stream requests RACE three configs in parallel (full > indian >
 * addon-default) with an 18s ceiling and return the most complete
 * result that arrived in time - sources ALWAYS show. */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const UPSTREAM = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";

/* PenguPlay (pengu.uk) - user-supplied addon with embedded auth token.
 * GOLD for our player: it PROXIES everything through its own domain -
 * direct MP4s (pengu.uk/direct/...mp4) and HLS (pengu.uk/hls/...m3u8) -
 * so its streams are playable AS-IS (no generator, no link resolving). */
const PENGU = "https://pengu.uk/" +
  encodeURIComponent(JSON.stringify({ auth_token: "LNN2vJEqRNUjUgBsnSqMRWwI_Pb91VDdIoIDUK4RuyI" }));

const enc = (o: Record<string, string>) => encodeURIComponent(JSON.stringify(o));

/* priority order: richest config first */
const CONFIGS = [
  { key: "full", seg: enc({ multi: "on", al: "on", de: "on", es: "on", fr: "on", gu: "on", hi: "on", it: "on", ml: "on", mx: "on", pa: "on", ta: "on", te: "on", includeExternalUrls: "on" }) },
  { key: "indian", seg: enc({ multi: "on", hi: "on", ta: "on", te: "on", ml: "on", pa: "on", gu: "on", includeExternalUrls: "on" }) },
  { key: "default", seg: "" },
];

const RACE_MS = 18000; /* stay well under the CF function timeout */

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Yetflix)", accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(RACE_MS),
    });
    const body = await r.text();
    try { return JSON.parse(body); } catch { return null; }
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = new URL(req.url);
  const rest = path.map(encodeURIComponent).join("/");
  const search = url.search;

  try {
    if (path[0] === "stream") {
      /* PenguPlay first (direct-playable proxied links), WebStreamrMBG
       * configs raced as fallback - results MERGED so the player offers
       * every source we have. */
      const jobs = [
        fetchJson(`${PENGU}/${rest}${search}`),
        ...CONFIGS.map((c) => fetchJson(`${UPSTREAM}/${c.seg ? c.seg + "/" : ""}${rest}${search}`)),
      ];
      const results = await Promise.all(jobs);
      const merged: any[] = [];
      for (const j of results) {
        if (j && Array.isArray(j.streams)) {
          for (const st of j.streams) {
            if (st?.url && typeof st.url === "string" && merged.length < 80) merged.push(st);
          }
        }
      }
      return NextResponse.json(
        { streams: merged },
        { headers: { "content-type": "application/json", "cache-control": "public, max-age=120" } }
      );
    }

    /* everything else (extract etc.) - direct passthrough */
    const r = await fetch(`${UPSTREAM}/${rest}${search}`, {
      headers: { "user-agent": "Mozilla/5.0 (Yetflix)", accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(RACE_MS),
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
