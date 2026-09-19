import { NextRequest, NextResponse } from "next/server";

const HDHUB_MANIFEST =
  "https://hdhub.thevolecitor.qzz.io/eyJxdWFsaXRpZXMiOiIyMTYwcCwxMDgwcCw3MjBwLDQ4MHAiLCJzb3J0IjoiZGVzYyJ9";

const WEBSTREAMR_ADDON = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";
const WEBSTREAMR_CONFIG = encodeURIComponent(
  JSON.stringify({ multi: "on", hi: "on", ta: "on", te: "on" })
);

/** HDHub + WebStreamr combined addon: FSLv2, Pixeldrain, HubDrive/HubCloud, 4KHDHub direct
 *  downloads with Hindi/English/Multi-Audio streams via Stremio protocol. Combines sources
 *  from both HDHub and WebStreamr for maximum content availability. Hindi audio preferred
 *  in streams (DDP 2.0 Hindi + English DDP 5.1). Returns playable stream URLs for movies
 *  and TV series. Accepts TMDB IDs (tmdb:123) or IMDb IDs (tt1234567).
 *  Every link the addons return is shown — cloud page links (HubDrive/FSL zips) included;
 *  the client decides play vs VLC per link, nothing is dropped here. */
export const runtime = "edge";

const okKind = (k: string) => k === "movie" || k === "series";
const okId = (id: string) => /^(tmdb:\d+(:\d+:\d+)?|tt\d+(:\d+:\d+)?)$/.test(id);

/* Keep EVERY link the addons return: direct media (mp4/mkv/m3u8/dash),
 * signed R2/FSL files and cloud page links (HubDrive/HubDrive pics/GDFlix
 * file pages, pixeldrain.com shares). The client renders all rows and only
 * hands the non-browser ones to VLC — dropping them here silently hid
 * several 4K/REMUX results in the UI. Only truly empty urls are skipped. */
const isPlayableUrl = (url: string) => !!url && /^https?:\/\//i.test(url);

// Mark streams with their source
const markSource = (streams: any[], source: string) => {
  return streams.map((s: any) => ({
    ...s,
    _source: source,
    description: `${s.description || ""} [${source}]`
  }));
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;
  if (!okKind(kind) || !okId(id)) {
    return NextResponse.json({ error: "forbidden", streams: [] }, { status: 403 });
  }

  const search = req.nextUrl.searchParams;
  const imdbParam = search.get("imdb") || undefined;

  try {
    // Use IMDb ID if provided, otherwise use TMDB ID
    const streamId = imdbParam?.startsWith("tt") ? imdbParam : id;
    
    // Fetch from both sources in parallel (HDHub is the primary lane; a
    // WebStreamr outage alone must not fail the request)
    const [hdhubRes, webstreamrRes] = await Promise.allSettled([
      fetch(`${HDHUB_MANIFEST}/stream/${kind}/${streamId}.json`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(60000),
      }),
      fetch(`${WEBSTREAMR_ADDON}/${WEBSTREAMR_CONFIG}/stream/${kind}/${streamId}.json`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(95000),
      })
    ]);

    let allStreams: any[] = [];
    let hdhubFailed = false;

    // Process HDHub results
    if (hdhubRes.status === "fulfilled" && hdhubRes.value.ok) {
      const hdhubData = await hdhubRes.value.json();
      const hdhubStreams = (hdhubData.streams || []).filter(
        (s: any) => s.url && !s.externalUrl && s.name && 
                    !s.name.includes("Donation") && !s.name.includes("Discord")
      );
      allStreams.push(...markSource(hdhubStreams, "HDHub"));
    } else {
      hdhubFailed = true;
      console.warn("[hdhub] primary addon unavailable:",
        hdhubRes.status === "rejected" ? (hdhubRes.reason as Error)?.message : `HTTP ${hdhubRes.value.status}`);
    }

    // Process WebStreamr results
    if (webstreamrRes.status === "fulfilled" && webstreamrRes.value.ok) {
      const webstreamrData = await webstreamrRes.value.json();
      const webstreamrStreams = (webstreamrData.streams || []).filter(
        (s: any) => s.url && !s.externalUrl && s.name
      );
      allStreams.push(...markSource(webstreamrStreams, "WebStreamr"));
    }

    // Filter out non-playable URLs (zip files, attachments)
    const playableStreams = allStreams.filter((s: any) => isPlayableUrl(s.url));

    // Remove duplicates based on URL
    const uniqueStreams = playableStreams.filter((stream, index, self) =>
      index === self.findIndex((s) => s.url === stream.url)
    );

    // Prioritize: Hindi audio first, then by quality (descending), then by source (HDHub preferred)
    if (!uniqueStreams.length && hdhubFailed) {
      return NextResponse.json(
        { laneError: "HDHub is unreachable right now — tap Retry to search again.", streams: [] },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const sortedStreams = uniqueStreams.sort((a: any, b: any) => {
      const aHindi = (a.description || "").toLowerCase().includes("hindi");
      const bHindi = (b.description || "").toLowerCase().includes("hindi");
      if (aHindi && !bHindi) return -1;
      if (!aHindi && bHindi) return 1;
      
      const aQuality = extractQuality(a.name, a.description);
      const bQuality = extractQuality(b.name, b.description);
      if (aQuality !== bQuality) return bQuality - aQuality;
      
      // Prefer HDHub over WebStreamr for same quality
      const aHdhub = a._source === "HDHub";
      const bHdhub = b._source === "HDHub";
      if (aHdhub && !bHdhub) return -1;
      if (!aHdhub && bHdhub) return 1;
      
      return 0;
    });

    return NextResponse.json({ streams: sortedStreams }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const timeout = !!e && (e as Error).name === "TimeoutError";
    return NextResponse.json(
      { error: timeout ? "addon_timeout" : "addon_unreachable", streams: [] },
      { status: 504 }
    );
  }
}

/** Extract quality number from stream name or description
 *  (e.g. "2160p", "1080p", "720p", "480p" — HDHub puts the real resolution
 *  in the description, while names say "4KHDHub 4K" / "HdHub 2160p"). */
function extractQuality(name: string, description?: string): number {
  const match = (description || "").match(/(\d{3,4})p/i) || name.match(/(\d{3,4})p/i);
  if (match) return parseInt(match[1], 10);
  return 0;
}