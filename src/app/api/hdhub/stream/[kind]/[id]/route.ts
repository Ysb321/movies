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
 *  the client decides play vs VLC per link, nothing is dropped here.
 *  Reliability: browser-like UA (the addon host is Cloudflare-fronted and challenges
 *  bare edge-fetch UAs), HDHub retried once on transient failure, and a `diag` string
 *  on lane errors (castle/moviesmod/nuvio convention) so outages are debuggable. */
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

/* Some addon hosts (Cloudflare) challenge datacenter requests that carry the
 * default runtime UA — send a normal browser UA + JSON accept instead. */
const ADDON_HEADERS: Record<string, string> = {
  accept: "application/json, */*",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

type AddonResult =
  | { ok: true; streams: any[] }
  | { ok: false; detail: string };

/** Fetch a Stremio addon stream resource; resolves to a typed result instead of
 *  throwing so the lane can degrade gracefully and report why. */
async function fetchAddonStreams(
  url: string,
  timeoutMs: number
): Promise<AddonResult> {
  try {
    const res = await fetch(url, {
      headers: ADDON_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const streams = Array.isArray(data?.streams) ? data.streams : [];
    return { ok: true, streams };
  } catch (e) {
    const err = e as Error;
    const detail = err?.name === "TimeoutError" ? "timeout" : err?.message || "network error";
    return { ok: false, detail };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  // Use IMDb ID if provided, otherwise use TMDB ID
  const streamId = imdbParam?.startsWith("tt") ? imdbParam : id;

  // HDHub is the primary lane: try, and retry once on transient failure
  // (cold starts / 52x / blips). WebStreamr is a bonus source — its failure
  // must never fail the request. Worst-case server time ≈ 30s + 0.9s + 30s
  // (retries) ≈ 61s, safely under the client's 90s abort.
  const hdhubUrl = `${HDHUB_MANIFEST}/stream/${kind}/${streamId}.json`;
  const webstreamrUrl = `${WEBSTREAMR_ADDON}/${WEBSTREAMR_CONFIG}/stream/${kind}/${streamId}.json`;

  const [hdhubFirst, webstreamrRes] = await Promise.all([
    fetchAddonStreams(hdhubUrl, 30000),
    fetchAddonStreams(webstreamrUrl, 60000),
  ]);

  let hdhubResult = hdhubFirst;
  if (!hdhubResult.ok) {
    console.warn("[hdhub] primary addon failed, retrying once:", hdhubResult.detail);
    await sleep(900);
    hdhubResult = await fetchAddonStreams(hdhubUrl, 30000);
  }

  let allStreams: any[] = [];
  const diag: string[] = [];

  // Process HDHub results
  if (hdhubResult.ok) {
    const hdhubStreams = hdhubResult.streams.filter(
      (s: any) => s.url && !s.externalUrl && s.name &&
                  !s.name.includes("Donation") && !s.name.includes("Discord")
    );
    allStreams.push(...markSource(hdhubStreams, "HDHub"));
    diag.push(`hdhub:${hdhubStreams.length}`);
  } else {
    diag.push(`hdhub:FAIL(${hdhubResult.detail})`);
  }

  // Process WebStreamr results
  if (webstreamrRes.ok) {
    const webstreamrStreams = webstreamrRes.streams.filter(
      (s: any) => s.url && !s.externalUrl && s.name
    );
    allStreams.push(...markSource(webstreamrStreams, "WebStreamr"));
    diag.push(`ws:${webstreamrStreams.length}`);
  } else {
    diag.push(`ws:FAIL(${webstreamrRes.detail})`);
  }

  // Filter out non-playable URLs (zip files, attachments)
  const playableStreams = allStreams.filter((s: any) => isPlayableUrl(s.url));

  // Remove duplicates based on URL
  const uniqueStreams = playableStreams.filter((stream, index, self) =>
    index === self.findIndex((s) => s.url === stream.url)
  );

  const diagStr = diag.join(" ");

  // Total outage -> lane error (200 + laneError, the client-lane convention:
  // castle/moviesmod/nuvio do the same so HindiSources can show the message).
  // When the primary addon blocked US (the server), hand the browser the exact
  // addon URL: hdhub.thevolecitor.qzz.io sends access-control-allow-origin: *,
  // so the client can fetch it directly with the visitor's own IP and render
  // the results itself (same proxy-first/direct-fallback idea as TMDB).
  if (!uniqueStreams.length) {
    // Primary addon failed (e.g. Cloudflare 403 on our server IP) and the
    // response is otherwise empty — hand the browser the exact addon URL so
    // it can retry directly with the visitor's own IP. (When WebStreamr did
    // return rows we serve them instead; the client only consumes the
    // fallback contract on empty responses.)
    if (!hdhubResult.ok) {
      return NextResponse.json(
        {
          laneError: "HDHub is unreachable right now — tap Retry to search again.",
          streams: [],
          diag: diagStr,
          hdhubFailed: true,
          fallbackUrl: hdhubUrl,
        },
        { headers: { "cache-control": "no-store" } }
      );
    }
    // Addons answered but returned nothing usable — title not (yet) in their
    // catalogues ("Still being added"), not an outage.
    return NextResponse.json(
      { noSource: true, streams: [], diag: diagStr },
      { headers: { "cache-control": "no-store" } }
    );
  }

  // Prioritize: Hindi audio first, then by quality (descending), then by source (HDHub preferred)
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

  return NextResponse.json(
    { streams: sortedStreams, diag: diagStr },
    { headers: { "cache-control": "no-store" } }
  );
}

/** Extract quality number from stream name or description
 *  (e.g. "2160p", "1080p", "720p", "480p" — HDHub puts the real resolution
 *  in the description, while names say "4KHDHub 4K" / "HdHub 2160p"). */
function extractQuality(name: string, description?: string): number {
  const match = (description || "").match(/(\d{3,4})p/i) || name.match(/(\d{3,4})p/i);
  if (match) return parseInt(match[1], 10);
  return 0;
}
