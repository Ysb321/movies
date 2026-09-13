import { NextRequest, NextResponse } from "next/server";

const HDHUB_MANIFEST =
  "https://hdhub.thevolecitor.qzz.io/eyJ0b3Jyb3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAiLCJzb3J0IjoiZGVzYyJ9";

const WEBSTREAMR_ADDON = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";
const WEBSTREAMR_CONFIG = encodeURIComponent(
  JSON.stringify({ multi: "on", hi: "on", ta: "on", te: "on" })
);

/** HDHub + WebStreamr combined addon: FSLv2, Pixeldrain, HubCloud, 4KHDHub direct downloads
 *  with Hindi/English/Multi-Audio streams via Stremio protocol. Combines sources from both
 *  HDHub and WebStreamr for maximum content availability. Hindi audio preferred in streams
 *  (DDP 2.0 Hindi + English DDP 5.1). Returns playable stream URLs for movies and TV series.
 *  Accepts TMDB IDs (tmdb:123) or IMDb IDs (tt1234567). */
export const runtime = "edge";

const okKind = (k: string) => k === "movie" || k === "series";
const okId = (id: string) => /^(tmdb:\d+(:\d+:\d+)?|tt\d+(:\d+:\d+)?)$/.test(id);

// Filter out non-playable links (zip files, attachements, etc.)
const isPlayableUrl = (url: string) => {
  // Allow cloudflare storage URLs (FSLv2, FSL, HubCloud)
  if (url.includes(".cloudflarestorage.com") || url.includes("r2.cloudflarestorage.com")) {
    // Filter out zip file attachments
    return !url.includes("response-content-disposition=attachment") || 
           url.includes(".mp4") || url.includes(".mkv") || url.includes(".mov") || url.includes(".m3u8");
  }
  // Allow direct download URLs (Pixeldrain, HubCloud direct)
  if (url.includes("pixeldrain.dev/api/file") || url.includes("pixel.hubcloud.cx") || 
      url.includes("gpdl.hubcloud.cx") || url.includes("gpdl2.hubcloud.cx")) {
    return true;
  }
  // Allow other streaming URLs (HLS, DASH, etc.)
  if (url.includes(".m3u8") || url.includes(".mpd") || url.includes(".mp4") || url.includes(".mkv")) {
    return true;
  }
  return false;
};

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
    
    // Fetch from both sources in parallel
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

    // Process HDHub results
    if (hdhubRes.status === "fulfilled" && hdhubRes.value.ok) {
      const hdhubData = await hdhubRes.value.json();
      const hdhubStreams = (hdhubData.streams || []).filter(
        (s: any) => s.url && !s.externalUrl && s.name && 
                    !s.name.includes("Donation") && !s.name.includes("Discord")
      );
      allStreams.push(...markSource(hdhubStreams, "HDHub"));
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
    const sortedStreams = uniqueStreams.sort((a: any, b: any) => {
      const aHindi = (a.description || "").toLowerCase().includes("hindi");
      const bHindi = (b.description || "").toLowerCase().includes("hindi");
      if (aHindi && !bHindi) return -1;
      if (!aHindi && bHindi) return 1;
      
      const aQuality = extractQuality(a.name);
      const bQuality = extractQuality(b.name);
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

/** Extract quality number from stream name (e.g. "2160p", "1080p", "720p", "480p") */
function extractQuality(name: string): number {
  const match = name.match(/(\d{3,4})p/i);
  if (match) return parseInt(match[1], 10);
  return 0;
}