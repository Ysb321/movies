/* Multi Dub sources via the Vega provider engine (vega-providers).
 * One call: resolve TMDB title/year, search all providers in parallel,
 * validate titles, resolve TV episodes, run getStream - returns direct
 * playable chips. Success cached 5 min at the edge; empty never cached.
 * Runs in BOTH the deployed site (edge) and the exe's local server
 * (user's IP - hosts that block Cloudflare workers still work there). */
import { NextRequest, NextResponse } from "next/server";
import { listAll } from "@/lib/vega/engine";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const TMDB_KEY = process.env.TMDB_API_KEY ?? "f8243ad5d5cd1ef0ebe5d6c5bfcc59f2";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") === "tv" ? "tv" : "movie";
  const tmdb = sp.get("tmdb") ?? "";
  const season = parseInt(sp.get("season") ?? "1", 10) || 1;
  const episode = parseInt(sp.get("episode") ?? "1", 10) || 1;
  if (!/^\d+$/.test(tmdb)) return NextResponse.json({ streams: [], error: "bad id" });

  let meta = { title: "", year: 0 };
  const oTitle = sp.get("title");
  const oYear = parseInt(sp.get("year") ?? "0", 10) || 0;
  if (oTitle) {
    meta = { title: oTitle, year: oYear };
  } else {
    try {
      const r = await fetch(
        `https://api.themoviedb.org/3/${type}/${tmdb}?api_key=${TMDB_KEY}`,
        { signal: AbortSignal.timeout(7000), cache: "no-store" }
      );
      const j = await r.json().catch(() => null);
      const date: string = j?.release_date ?? j?.first_air_date ?? "";
      meta = { title: j?.title ?? j?.name ?? "", year: parseInt(date.slice(0, 4), 10) || 0 };
    } catch {}
  }
  if (!meta.title) return NextResponse.json({ streams: [], error: "no meta" });

  try {
    const dbg = sp.get("debug") === "1" ? [] : undefined;
    const chips = await listAll(meta, type, season, episode, dbg);
    return NextResponse.json(
      dbg ? { streams: chips, debug: dbg } : { streams: chips },
      { headers: chips.length ? { "cache-control": "public, max-age=300" } : { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ streams: [], error: e?.message ?? "engine failed" }, {
      headers: { "cache-control": "no-store" },
    });
  }
}
