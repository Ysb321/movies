/* Multi Dub sources - PenguPlay (pengu.uk, user-supplied addon+token).
 * Everything is proxied through their domain (direct MP4s + HLS), so
 * every stream is playable AS-IS by the in-house player.
 *
 * Rate-limit resilience (pengu throttles bursts):
 *  - successful lists are edge-cached 5 min (fewer pengu hits; psig
 *    links live well beyond that)
 *  - rate_limited/429 answers are NEVER cached and get one backoff
 *    retry (limits are short-window)
 *  - the player's recovery/watchdog refetches hit this cache, not pengu */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const PENGU = "https://pengu.uk/" +
  encodeURIComponent(JSON.stringify({ auth_token: "LNN2vJEqRNUjUgBsnSqMRWwI_Pb91VDdIoIDUK4RuyI" }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const rest = path.map(encodeURIComponent).join("/");

  const hit = async (): Promise<{ status: number; body: string; limited: boolean }> => {
    try {
      const r = await fetch(`${PENGU}/${rest}`, {
        headers: { "user-agent": "Mozilla/5.0 (Yetflix)", accept: "application/json" },
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(25000),
      });
      const body = await r.text();
      return { status: r.status, body, limited: r.status === 429 || /rate_limited/i.test(body) };
    } catch (e: any) {
      return { status: 200, body: JSON.stringify({ streams: [], error: e?.message ?? "addon unreachable" }), limited: false };
    }
  };

  let res = await hit();
  if (res.limited) {
    /* short-window limit - one patient retry */
    await sleep(2200);
    res = await hit();
  }

  if (res.limited) {
    return new NextResponse(res.body, {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  return new NextResponse(res.body, {
    status: res.status,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
