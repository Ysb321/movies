/* Multi Dub sources via the Vega provider engine (vega-providers).
 * Cloudflare free tier caps a Worker invocation at ~50 subrequests -
 * 49 providers need far more - so on the SITE we run providers in
 * batches of 8 per request and merge results into an edge-cached
 * state (30 min) keyed by title; repeat requests (the player tops up
 * automatically) accumulate coverage across ALL providers. The
 * desktop exe's local server has no such limit: it runs everything
 * in one shot. Runs TMDB -> engine -> DIRECT playable chips. */
import { NextRequest, NextResponse } from "next/server";
import { listAll, VEGA_PROVIDER_VALUES, VegaChip, VegaDebug } from "@/lib/vega/engine";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const TMDB_KEY = process.env.TMDB_API_KEY ?? "f8243ad5d5cd1ef0ebe5d6c5bfcc59f2";
const BATCH = 8;
const CACHE_TTL = 1800; // 30 min merged-state TTL

type CacheState = { chips: VegaChip[]; done: string[] };

async function readCache(key: string): Promise<CacheState | null> {
  try {
    const c = (globalThis as any).caches?.default;
    if (!c) return null;
    const r = await c.match(new Request(key));
    if (!r) return null;
    return await r.json();
  } catch { return null; }
}

async function writeCache(key: string, state: CacheState) {
  try {
    const c = (globalThis as any).caches?.default;
    if (!c) return;
    await c.put(
      new Request(key),
      new Response(JSON.stringify(state), {
        headers: { "content-type": "application/json", "cache-control": `max-age=${CACHE_TTL}` },
      })
    );
  } catch {}
}

const dedupe = (chips: VegaChip[]): VegaChip[] => {
  const seen = new Set<string>();
  const out: VegaChip[] = [];
  for (const c of chips) {
    if (seen.has(c.link)) continue;
    seen.add(c.link);
    out.push(c);
  }
  return out;
};

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
    if (!meta.title) return NextResponse.json({ streams: [], error: "no meta" }, { headers: { "cache-control": "no-store" } });
  }

  /* exe / local dev / ?full=1 -> everything in one shot, no batching */
  const local =
    sp.get("full") === "1" || /localhost|127\.0\.0\.1/i.test(req.nextUrl.hostname ?? "");
  const cacheKey = `https://vega-cache.local/${type}/${tmdb}/${season}/${episode}`;

  try {
    if (local) {
      const dbg = sp.get("debug") === "1" ? [] : undefined;
      const chips = await listAll(meta, type, season, episode, undefined, dbg);
      return NextResponse.json(
        dbg ? { streams: chips, debug: dbg, more: 0 } : { streams: chips, more: 0 },
        { headers: { "cache-control": "no-store" } }
      );
    }

    /* batched site mode: merge with whatever earlier batches found */
    const state = (await readCache(cacheKey)) ?? { chips: [], done: [] };
    const doneSet = new Set(state.done);
    const pending = VEGA_PROVIDER_VALUES.filter((v) => !doneSet.has(v));
    const batch = pending.slice(0, BATCH);
    const dbg = sp.get("debug") === "1" ? [] : undefined;

    let fresh: VegaChip[] = [];
    if (batch.length) {
      fresh = await listAll(meta, type, season, episode, batch, dbg);
      const merged = dedupe([...state.chips, ...fresh]).slice(0, 80);
      const done = Array.from(new Set([...state.done, ...batch]));
      const keep = done.filter((v) => VEGA_PROVIDER_VALUES.includes(v));
      await writeCache(cacheKey, { chips: merged, done: keep });
      const remaining = VEGA_PROVIDER_VALUES.filter((v) => !keep.includes(v)).length;
      return NextResponse.json(
        dbg ? { streams: merged, debug: dbg, more: remaining } : { streams: merged, more: remaining },
        { headers: { "cache-control": "no-store" } }
      );
    }

    /* all batches already ran for this title - serve the cached set */
    return NextResponse.json(
      dbg ? { streams: state.chips, more: 0 } : { streams: state.chips, more: 0 },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ streams: [], error: e?.message ?? "engine failed" }, {
      headers: { "cache-control": "no-store" },
    });
  }
}
