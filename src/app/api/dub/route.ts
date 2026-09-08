/* Multi Dub sources via the CloudStream-port engine.
 * CF free tier caps ~50 subrequests/invocation and each provider's
 * movie flow costs 8-15 fetches, so the SITE runs 2 providers per
 * request and merges results into an edge-cached state (30 min);
 * the player tops up automatically until all providers are covered.
 * The desktop exe's local server (no such limit) runs everything in
 * one shot. Every chip is a DIRECT link for VLC. */
import { NextRequest, NextResponse } from "next/server";
import { listAll, CS_PROVIDER_VALUES, CsChip, CsDebug } from "@/lib/cs/engine";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const TMDB_KEY = process.env.TMDB_API_KEY ?? "f8243ad5d5cd1ef0ebe5d6c5bfcc59f2";
const BATCH = 2;
const SITE_FETCH_BUDGET = 38; /* ~50 CF subrequests minus TMDB/urls.json */
const CACHE_TTL = 1800; // 30 min
const CACHE_V = "cs3";
const MAX_TRIES = 4;

type CacheState = { chips: CsChip[]; done: string[]; tries?: Record<string, number> };

async function readCache(key: string): Promise<CacheState | null> {
  try {
    const c = (globalThis as any).caches?.default;
    if (!c) return null;
    const r = await c.match(new Request(key));
    if (!r) return null;
    return await r.json();
  } catch {
    return null;
  }
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

const dedupe = (chips: CsChip[]): CsChip[] => {
  const seen = new Set<string>();
  return chips.filter((c) => (seen.has(c.link) ? false : (seen.add(c.link), true)));
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") === "tv" ? "tv" : "movie";
  const tmdb = sp.get("tmdb") ?? "";
  const season = parseInt(sp.get("season") ?? "1", 10) || 1;
  const episode = parseInt(sp.get("episode") ?? "1", 10) || 1;
  if (!/^\d+$/.test(tmdb)) return NextResponse.json({ streams: [], error: "bad id" });

  let meta = { title: "", year: 0, imdbId: "" };
  const oTitle = sp.get("title");
  const oYear = parseInt(sp.get("year") ?? "0", 10) || 0;
  const oImdb = sp.get("imdb");
  if (oTitle) {
    meta = { title: oTitle, year: oYear, imdbId: oImdb ?? "" };
  } else {
    try {
      const r = await fetch(
        `https://api.themoviedb.org/3/${type}/${tmdb}?api_key=${TMDB_KEY}&append_to_response=external_ids`,
        { signal: AbortSignal.timeout(7000), cache: "no-store" }
      );
      const j = await r.json().catch(() => null);
      const date: string = j?.release_date ?? j?.first_air_date ?? "";
      meta = {
        title: j?.title ?? j?.name ?? "",
        year: parseInt(date.slice(0, 4), 10) || 0,
        imdbId: j?.external_ids?.imdb_id ?? "",
      };
    } catch {}
    if (!meta.title)
      return NextResponse.json({ streams: [], error: "no meta" }, { headers: { "cache-control": "no-store" } });
  }

  /* exe / local dev -> everything in one shot */
  const local = sp.get("full") === "1" || /localhost|127\.0\.0\.1/i.test(req.nextUrl.hostname ?? "");
  const cacheKey = `https://cs-cache.local/v${CACHE_V}/${type}/${tmdb}/${season}/${episode}`;
  const dbgOn = sp.get("debug") === "1";

  try {
    if (local) {
      const dbg = dbgOn ? [] : undefined;
      const chips = await listAll(meta, type, season, episode, undefined, dbg, {
        maxFetches: 2000,
      });
      return NextResponse.json(
        dbg ? { streams: chips, debug: dbg, more: 0 } : { streams: chips, more: 0 },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const state = (await readCache(cacheKey)) ?? { chips: [], done: [], tries: {} };
    state.tries = state.tries ?? {};
    const doneSet = new Set(state.done);
    const pending = CS_PROVIDER_VALUES.filter(
      (v) => !doneSet.has(v) && (state.tries![v] ?? 0) < MAX_TRIES
    );
    const batch = pending.slice(0, BATCH);
    const dbg = dbgOn ? ([] as CsDebug[]) : undefined;

    let fresh: CsChip[] = [];
    if (batch.length) {
      fresh = await listAll(meta, type, season, episode, batch, dbg, {
        maxFetches: SITE_FETCH_BUDGET,
      });
      const dbgByP = new Map((dbg ?? []).map((x) => [x.provider, x]));
      for (const v of batch) {
        const info = dbgByP.get(v);
        const solid =
          (!!info && info.chips > 0) ||
          (!!info && info.matched == null && info.err == null) ||
          (!!info && info.err === "no host links");
        if (solid) state.done.push(v);
        else if (info?.budget || /too many subrequests/i.test(info?.err ?? "")) {
          /* CF limit hit mid-run - retry free next request */
        } else state.tries![v] = (state.tries![v] ?? 0) + 1;
      }
      const merged = dedupe([...state.chips, ...fresh]).slice(0, 60);
      const done = Array.from(new Set(state.done)).filter((v) => CS_PROVIDER_VALUES.includes(v));
      await writeCache(cacheKey, { chips: merged, done, tries: state.tries });
      const remaining = CS_PROVIDER_VALUES.filter(
        (v) => !done.includes(v) && (state.tries![v] ?? 0) < MAX_TRIES
      ).length;
      return NextResponse.json(
        dbg ? { streams: merged, debug: dbg, more: remaining } : { streams: merged, more: remaining },
        { headers: { "cache-control": "no-store" } }
      );
    }

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
