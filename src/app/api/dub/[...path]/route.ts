/* Multi Dub sources - PenguPlay (pengu.uk, user-supplied addon+token).
 * Everything is proxied through their domain (direct MP4s + HLS), so
 * every stream is playable AS-IS by the in-house player. Lists cached
 * 2 min at the edge. WebStreamrMBG removed per user request. */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const PENGU = "https://pengu.uk/" +
  encodeURIComponent(JSON.stringify({ auth_token: "LNN2vJEqRNUjUgBsnSqMRWwI_Pb91VDdIoIDUK4RuyI" }));

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rest = path.map(encodeURIComponent).join("/");
  try {
    const r = await fetch(`${PENGU}/${rest}`, {
      headers: { "user-agent": "Mozilla/5.0 (Yetflix)", accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=120" },
    });
  } catch (e: any) {
    return NextResponse.json({ streams: [], error: e?.message ?? "addon unreachable" }, { status: 200 });
  }
}
