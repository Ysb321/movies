/* Server-side "Generate Link" step for Multi Dub (user-designed flow):
 * the WebStreamrMBG extract URL redirects through HubCloud's link
 * generator (dl.php?link=<direct file>) - we follow the chain here,
 * pull the generated direct link out of the redirect target (or the
 * page's Download Here href), and hand it to our player. No JS needed -
 * the chain resolves with plain redirects (verified). */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const ADDON = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";

export async function GET(req: NextRequest) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u || !u.startsWith(ADDON + "/")) {
    return NextResponse.json({ error: "bad source" }, { status: 400 });
  }
  try {
    const r = await fetch(u, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Yetflix", accept: "text/html,*/*" },
      cache: "no-store",
    });
    /* 1) dl.php-style targets carry the generated link in ?link= */
    try {
      const link = new URL(r.url).searchParams.get("link");
      if (link && /^https?:\/\//i.test(link)) {
        return NextResponse.json({ url: link, via: "redirect-param" });
      }
    } catch {}
    /* 2) otherwise scan the generator page for the Download Here href */
    const html = await r.text();
    const m =
      html.match(/href=["'](https?:\/\/[^\s"'<>]*(?:googleusercontent|gdrive|drive\.usercontent)[^\s"'<>]*)["']/i) ||
      html.match(/href=["'](https?:\/\/[^\s"'<>]+\.(?:mkv|mp4|webm|m3u8)[^\s"'<>]*)["']/i) ||
      html.match(/(https?:\/\/[^\s"'<>]*googleusercontent\.com[^\s"'<>]+)/i);
    if (m) {
      return NextResponse.json({ url: m[1].replace(/&amp;/g, "&"), via: "page-href" });
    }
    /* 3) landed on a media file directly? */
    const ct = r.headers.get("content-type") ?? "";
    if (/^(video|application\/octet|application\/x-mpeg)/i.test(ct)) {
      return NextResponse.json({ url: r.url, via: "direct" });
    }
    return NextResponse.json({ error: "could not generate link" }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "resolve failed" }, { status: 502 });
  }
}
