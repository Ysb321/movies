import { NextRequest, NextResponse } from "next/server";

/* Server 10 (NetMirror) stream API - Indian-OTT direct links (Netflix /
 * Hotstar / Prime Video / Disney rips) keyed by TMDB id. Two lanes:
 *  1. Netflix-direct: GET {BASE}/api/embed-tmdb/{tmdb} (+?type=tv&se=&ep=)
 *     returns signed mp4s (360/480/720/1080) + caption tracks incl. Hindi
 *     (verified live 2026-09-09: Fight Club 550, RRR 579974, Breaking Bad
 *     1396 S01E01 - all exact matches; one transient 502 seen, hence the
 *     retry below).
 *  2. NewTV fallback (Hotstar/Prime/Disney + Netflix-if-direct-empty):
 *     rotating-domain discovery (checknewtv.php -> base64 api base) then
 *     search.php -> post.php -> (episodes.php) -> player.php per the
 *     TMDB-Embed-API netmirror provider. Code-complete but UNVERIFIED
 *     from here (needs Ott headers a plain probe can't send) - every
 *     platform fails soft to [] so direct results always survive.
 * Caption urls are rewritten to our /api/netmirror/sub proxy (CORS for
 * the site player). Signed stream urls live ~hours: no cache, no-store.
 */

export const runtime = "edge";

const BASE = "https://net27.cc"; /* rotates occasionally - provider default */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* base64 discovery domains (mobiledetects/mobidetct family) */
const NEW_TV_DOMAINS_B64 = [
  "aHR0cHM6Ly9tb2JpbGVkZXRlY3RzLmNvbQ==",
  "aHR0cHM6Ly9tb2JpbGVkZXRlY3QuYXBw",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmFydA==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNj",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0Lmluaw==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmxpdmU=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnBybw==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNob3A=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNpdGU=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNwYWNl",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnN0b3Jl",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LnZpcA==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0Lndpa2k=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0Lnh5eg==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5hcnQ=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5jYw==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbmZv",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbms=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5saWl2ZQ==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5wcm8=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5zdG9yZQ==",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy50b3A=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo=",
  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr",
];

const OTT: Record<string, string> = { netflix: "nf", primevideo: "pv", hotstar: "hs", disney: "hs" };
const PLATFORMS = ["primevideo", "hotstar", "disney", "netflix"]; /* netflix last: only if direct is empty */
const LABEL: Record<string, string> = {
  netflix: "Netflix",
  primevideo: "Prime Video",
  hotstar: "Hotstar",
  disney: "Disney+",
};

let newTvBases: string[] = []; /* all discovered bases, per isolate */

type NmStream = { quality: string; size?: number; url: string; platform: string };
type NmCaption = { lang: string; name: string; url: string };

const okKind = (k: string) => k === "movie" || k === "series";
const okMovieId = (id: string) => /^\d+$/.test(id);
const okSeriesId = (id: string) => /^\d+:\d+:\d+$/.test(id);

async function fetchDirect(
  tmdb: string,
  series: { s: number; e: number } | null
): Promise<{ title: string; streams: NmStream[]; captions: NmCaption[]; noSource: boolean }> {
  const url = series
    ? `${BASE}/api/embed-tmdb/${tmdb}?type=tv&se=${series.s}&ep=${series.e}`
    : `${BASE}/api/embed-tmdb/${tmdb}`;
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json, text/plain, */*", Referer: `${BASE}/`, "User-Agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        last = `direct ${res.status}`;
        continue; /* transient 502s seen - retry once */
      }
      const data = await res.json();
      if (!data || data.ok !== true)
        return { title: "", streams: [], captions: [], noSource: !!data && data.noSource === true };
      const streams: NmStream[] = Array.isArray(data.streams)
        ? data.streams
            .filter((s: { url?: string }) => s && s.url)
            .map((s: { url: string; resolution?: number | string; size?: number }) => ({
              quality: s.resolution ? `${s.resolution}p` : "Auto",
              size: typeof s.size === "number" ? s.size : undefined,
              url: s.url,
              platform: "Netflix",
            }))
        : [];
      if (!streams.length && data.mp4) {
        streams.push({
          quality: data.resolution ? `${data.resolution}p` : "Auto",
          url: data.mp4,
          platform: "Netflix",
        });
      }
      const captions: NmCaption[] = Array.isArray(data.captions)
        ? data.captions
            .filter((c: { url?: string }) => c && c.url)
            .map((c: { lang?: string; name?: string; url: string }) => {
              const abs = c.url.startsWith("/") ? `${BASE}${c.url}` : c.url;
              return {
                lang: c.lang || "en",
                name: c.name || c.lang || "English",
                url: `/api/netmirror/sub?u=${encodeURIComponent(abs)}`,
              };
            })
        : [];
      return {
        title: typeof data.title === "string" ? data.title : "",
        streams,
        captions,
        noSource: data.noSource === true,
      };
    } catch (e) {
      last = e instanceof Error ? e.message : "unreachable";
    }
  }
  throw new Error(last || "direct failed");
}

const jarCookies = (h: Headers): string[] => {
  const getter = (h as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const raw: string[] =
    typeof getter === "function" ? getter.call(h) : [h.get("set-cookie") || ""];
  return raw
    .map((c) => (c || "").split(";")[0].trim())
    .filter((c) => c.includes("="));
};

let newTvJar = ""; /* checknewtv harvest, set by discovery */
const newTvHeaders = (ott: string, extra: Record<string, string> = {}, base = "", jar = "") => ({
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "X-Requested-With": "NetmirrorNewTV v1.0",
  Accept: "application/json, text/plain, */*",
  Ott: ott,
  "User-Agent": UA,
  "Accept-Language": "en-IN,en;q=0.9,hi;q=0.7",
  ...(base ? { Referer: `${base}/` } : {}),
  ...(jar ? { Cookie: jar } : {}),
  ...extra,
});

const shortHost = (u: string): string => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "?";
  }
};

/* discovery: collect up to 3 distinct bases (gating may differ per
 * backend host) + harvest every Set-Cookie checknewtv plants - the
 * verify wall 403s our edge, but this endpoint answers 200 */
async function discoverNewTv(notes?: string[]): Promise<string[]> {
  if (newTvBases.length > 0) {
    notes?.push(`base:cached(${newTvBases.length})`);
    return newTvBases;
  }
  const bases: string[] = [];
  const jar: string[] = [];
  let tried = 0;
  let lastErr = "";
  for (const b64 of NEW_TV_DOMAINS_B64) {
    if (bases.length >= 3) break;
    let domain = "";
    try {
      tried++;
      domain = atob(b64);
      const res = await fetch(`${domain}/checknewtv.php`, {
        headers: newTvHeaders("nf"),
        signal: AbortSignal.timeout(5000),
      });
      for (const c of jarCookies(res.headers)) {
        const k = c.split("=")[0];
        const i = jar.findIndex((x) => x.split("=")[0] === k);
        if (i >= 0) jar[i] = c;
        else jar.push(c);
      }
      const data = await res.json();
      if (data && data.token_hash) {
        const base = atob(data.token_hash).replace(/\/$/, "");
        if (base && !bases.includes(base)) bases.push(base);
      } else {
        lastErr = `http ${res.status} no-token`;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message.slice(0, 40) : "err";
    }
  }
  if (bases.length === 0)
    throw new Error(`newtv discovery failed (${tried} domains, last: ${lastErr})`);
  newTvBases = bases;
  newTvJar = jar.join("; ");
  notes?.push(
    `bases:${bases.map(shortHost).join("+")} jar:${jar.map((c) => c.split("=")[0]).join(",") || "none"}`
  );
  return bases;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

async function fetchPlatform(
  platform: string,
  title: string,
  type: "movie" | "series",
  season: number,
  episode: number,
  notes: string[]
): Promise<NmStream[]> {
  try {
    const ott = OTT[platform];
    const bases = await discoverNewTv(notes);
    const jar = [newTvJar, "hd=on", "ott=nf"].filter(Boolean).join("; ");
    let api = bases[0];
    /* per-base loop: gating may differ by backend host */
    let search: any = null;
    for (const b of bases) {
      api = b;
      const searchRes = await fetch(`${b}/newtv/search.php?s=${encodeURIComponent(title)}`, {
        headers: newTvHeaders(ott, { Lastep: "", Usertoken: "" }, b, jar),
        signal: AbortSignal.timeout(12000),
      });
      if (searchRes.status === 403) {
        notes.push(`${platform}: ${shortHost(b)} 403`);
        continue;
      }
      if (!searchRes.ok) {
        notes.push(`${platform}: search http ${searchRes.status}`);
        return [];
      }
      search = await searchRes.json();
      break;
    }
    if (!search) return [];
    const first = search && Array.isArray(search.searchResult) ? search.searchResult[0] : null;
    if (!first || !first.id) {
      notes.push(`${platform}: no search results`);
      return [];
    }
    const postRes = await fetch(`${api}/newtv/post.php?id=${encodeURIComponent(first.id)}`, {
      headers: newTvHeaders(ott, { Lastep: "", Usertoken: "" }, api, jar),
      signal: AbortSignal.timeout(12000),
    });
    if (!postRes.ok) {
      notes.push(`${platform}: post http ${postRes.status}`);
      return [];
    }
    const post = await postRes.json();
    let targetId: string = first.id;
    if (type === "series") {
      /* collect episodes (page 1 + page 2 when paginated) */
      type Ep = { id: string; s: number | null; ep: number | null };
      const eps: Ep[] = [];
      const seasons = Array.isArray(post.season) ? post.season : [];
      const selIdx = seasons.findIndex((s: { selected?: boolean }) => s && s.selected);
      const seasonNo = selIdx >= 0 ? selIdx + 1 : null;
      const seasonId = selIdx >= 0 ? seasons[selIdx].id : post.nextPageSeason;
      for (const ep of post.episodes || []) {
        if (ep) eps.push({ id: ep.id, s: seasonNo ?? num(ep.sNum), ep: num(ep.ep) ?? num(ep.epNum) });
      }
      if (post.nextPageShow === 1 && seasonId) {
        try {
          const p2 = await fetch(`${api}/newtv/episodes.php?id=${encodeURIComponent(seasonId)}&page=2`, {
            headers: newTvHeaders(ott, {}, api, jar),
            signal: AbortSignal.timeout(12000),
          });
          const p2j = await p2.json();
          for (const ep of p2j.episodes || []) {
            if (ep) eps.push({ id: ep.id, s: seasonNo ?? num(ep.sNum), ep: num(ep.ep) ?? num(ep.epNum) });
          }
        } catch {
          /* page 1 still stands */
        }
      }
      const target = eps.find((x) => x.s === season && x.ep === episode);
      if (!target) {
        notes.push(`${platform}: ep not found`);
        return [];
      }
      targetId = target.id;
    } else {
      if (post.type === "t" || (post.episodes || []).filter(Boolean).length > 0) {
        notes.push(`${platform}: not a movie entry`);
        return [];
      }
      targetId = post.main_id || first.id;
    }
    const playRes = await fetch(`${api}/newtv/player.php?id=${encodeURIComponent(targetId)}`, {
      headers: newTvHeaders(ott, { Usertoken: "" }, api, jar),
      signal: AbortSignal.timeout(12000),
    });
    if (!playRes.ok) {
      notes.push(`${platform}: player http ${playRes.status}`);
      return [];
    }
    const play = await playRes.json();
    if (!play || !play.video_link) {
      notes.push(`${platform}: no video_link`);
      return [];
    }
    notes.push(`${platform}: ok`);
    return [{ quality: "Auto", url: play.video_link, platform: LABEL[platform] || platform }];
  } catch (err) {
    notes.push(
      `${platform}: EXC ${err instanceof Error ? err.message.slice(0, 60) : "err"}`
    );
    return [];
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const series = kind === "series";
  if (!okKind(kind) || (series ? !okSeriesId(id) : !okMovieId(id))) {
    return NextResponse.json({ error: "forbidden", streams: [], captions: [] }, { status: 403 });
  }
  const title = (req.nextUrl.searchParams.get("title") || "").slice(0, 200);
  const parts = id.split(":");
  const tmdb = parts[0];
  const s = series ? Number(parts[1]) : 1;
  const e = series ? Number(parts[2]) : 1;
  try {
    const direct = await fetchDirect(tmdb, series ? { s, e } : null);
    let extra: NmStream[] = [];
    const diag: string[] = [];
    if (title) {
      const wanted = PLATFORMS.filter((p) => p !== "netflix" || direct.streams.length === 0);
      /* serialized with 1.2s gaps: the proven NetMirror clients throttle
       * this fan-out (bursts trip the backend's Too Many Requests block) */
      for (const [i, p] of wanted.entries()) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1200));
        extra.push(...(await fetchPlatform(p, title, series ? "series" : "movie", s, e, diag)));
      }
    }
    /* Netflix-direct first (verified lane), then Hotstar/Prime/Disney */
    const streams = [...direct.streams, ...extra];
    return NextResponse.json(
      {
        title: direct.title || title,
        streams,
        captions: direct.captions,
        noSource: direct.noSource,
        ...(streams.length === 0 ? { diag: diag.join("; ").slice(0, 600) } : {}),
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    const timeout = !!e && (e as Error).name === "TimeoutError";
    return NextResponse.json(
      { error: timeout ? "netmirror_timeout" : "netmirror_unreachable", streams: [], captions: [] },
      { status: 504 }
    );
  }
}
