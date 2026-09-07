/* Multi Dub server-side link generator (auto-play fast path):
 * follows the addon extract chain (extract -> dl.php?link=<direct file>)
 * and returns the GENERATED direct URL so the player can start with no
 * iframe, no clicks, no download dialog. If the chain is walled
 * (Cloudflare on some routes / addon busy), the client falls back to the
 * generator-page flow. Retries with the index=0 (fast/10Gbps) variant. */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const ADDON = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";
const MEDIA = /googleusercontent|drive\.usercontent|videoplayback|\.mkv|\.mp4|\.webm|\.m3u8/i;

function extractLink(html: string): string | null {
  const patterns = [
    /href=["'](https?:\/\/[^"'<>]*(?:googleusercontent|drive\.usercontent|videoplayback)[^"'<>]*)["']/i,
    /href=["'](https?:\/\/[^"'<>]+\.(?:mkv|mp4|webm|m3u8)[^"'<>]*)["']/i,
    /(https?:\/\/[^\s"'<>]*googleusercontent\.com[^\s"'<>]+)/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1].replace(/&amp;/g, "&");
  }
  return null;
}

async function tryResolve(u: string): Promise<string | null> {
  const r = await fetch(u, {
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,*/*",
    },
  });
  /* generator pages carry the generated file in ?link= */
  try {
    const link = new URL(r.url).searchParams.get("link");
    if (link && /^https?:/i.test(link) && MEDIA.test(link)) return link;
  } catch {}
  /* landed on the media file itself */
  const ct = r.headers.get("content-type") ?? "";
  if (MEDIA.test(r.url) && !/text\/html/i.test(ct)) return r.url;
  /* scan the generator page for the Download Here href */
  if (/text\/html/i.test(ct)) return extractLink(await r.text());
  return null;
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u || !u.startsWith(ADDON + "/")) {
    return NextResponse.json({ error: "bad source" }, { status: 400 });
  }
  const variants = [u];
  try {
    const alt = new URL(u);
    alt.searchParams.set("index", "0"); /* fast/10Gbps variant of the same file */
    variants.push(alt.href);
  } catch {}
  for (const v of variants) {
    try {
      const got = await tryResolve(v);
      if (got) return NextResponse.json({ url: got, via: v === u ? "primary" : "index0" });
    } catch {}
  }
  return NextResponse.json({ error: "could not generate link" }, { status: 502 });
}
