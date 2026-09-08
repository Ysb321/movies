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
const BATCH = 6;
const SITE_FETCH_BUDGET = 38; /* ~50 CF subrequests minus TMDB/urls.json */
const CACHE_TTL = 1800; // 30 min merged-state TTL
const CACHE_V = "5"; // bump to flush merged states after engine changes
const MAX_TRIES = 5; // providers that keep returning nothing stop retrying

type CacheState = { chips: VegaChip[]; done: string[]; tries?: Record<string, number> };

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
  const cacheKey = `https://vega-cache.local/v${CACHE_V}/${type}/${tmdb}/${season}/${episode}`;

  try {
    if (local) {
      const dbg = sp.get("debug") === "1" ? [] : undefined;
      const chips = await listAll(meta, type, season, episode, undefined, dbg, { siteMode: false, maxFetches: 2000 });
      return NextResponse.json(
        dbg ? { streams: chips, debug: dbg, more: 0 } : { streams: chips, more: 0 },
        { headers: { "cache-control": "no-store" } }
      );
    }

    /* batched site mode: merge with whatever earlier batches found.
     * a provider counts as DONE only once it produced chips or at
     * least matched a post - dead-looking runs (subrequest kills,
     * timeouts) are retried up to MAX_TRIES on later requests */
    const state = (await readCache(cacheKey)) ?? { chips: [], done: [], tries: {} };
    state.tries = state.tries ?? {};
    const doneSet = new Set(state.done);
    const pending = VEGA_PROVIDER_VALUES.filter((v) => {
      if (doneSet.has(v)) return false;
      return (state.tries![v] ?? 0) < MAX_TRIES;
    });
    const batch = pending.slice(0, BATCH);
    const dbg = sp.get("debug") === "1" ? [] : undefined;

    let fresh: VegaChip[] = [];
    if (batch.length) {
      fresh = await listAll(meta, type, season, episode, batch, dbg, { siteMode: true, maxFetches: SITE_FETCH_BUDGET });
      const dbgByP = new Map((dbg ?? []).map((x: VegaDebug) => [x.provider, x]));
      for (const v of batch) {
        const info = dbgByP.get(v);
        /* done = produced chips, cleanly found nothing, or only
         * site-dead hosts (hubcloud/zcloud - exe still gets them) */
        const solid =
          (!!info && info.chips > 0) ||
          (!!info && info.matched == null && info.err == null) ||
          (!!info && info.err === "site-skip");
        if (solid) state.done.push(v);
        else if (info?.budget || /too many subrequests/i.test(info?.err ?? "")) {
          /* subrequest budget ran out mid-run: retry for free */
        } else state.tries![v] = (state.tries![v] ?? 0) + 1;
      }
      const merged = dedupe([...state.chips, ...fresh]).slice(0, 80);
      const done = Array.from(new Set(state.done));
      const keep = done.filter((v) => VEGA_PROVIDER_VALUES.includes(v));
      await writeCache(cacheKey, { chips: merged, done: keep, tries: state.tries });
      const remaining = VEGA_PROVIDER_VALUES.filter((v) => !keep.includes(v) && (state.tries![v] ?? 0) < MAX_TRIES).length;
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
