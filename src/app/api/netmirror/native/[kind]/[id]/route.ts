import { NextRequest, NextResponse } from "next/server";

/* Server 23 (NetMirror Playlists) - the NATIVE playlist lane. Where the
 * Server 19 lane uses the net27 embed-tmdb API + NewTV player.php, this
 * one walks the extension authors' SECONDARY flow (Sushan64/
 * NetMirror-Extension, NetflixMirrorProvider.kt): a trivial verify trick
 * mints the t_hash_t cookie, then mobile search/post resolves the
 * title/episode id, play.php mints an h-token, and playlist.php returns
 * HLS sources (Full/Mid/Low HD + numeric labels) plus caption tracks.
 * HLS plays via the site player's hls.js path; captions ride the shared
 * /api/netmirror/sub proxy. Playback Referer can't be spoofed from a
 * browser (their client sets it per-link) - if their HLS CDN 403s us,
 * this lane honestly empties and Servers 19/22 still stand. Signed urls
 * live ~hours: no cache, no-store. Full backend map: docs/netmirror.md.
 */

export const runtime = "edge";

const MAIN = "https://net52.cc";
const PLAY = "https://net77.cc/play.php";
const PLAYLIST = "https://net52.cc/playlist.php";
const NREF = "https://net77.cc/home";
const NORIG = "https://net77.cc";
const SUBCDN = "https://subscdn.top";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

const okKind = (k: string) => k === "movie" || k === "series";
const okMovieId = (id: string) => /^\d+$/.test(id);
const okSeriesId = (id: string) => /^\d+:\d+:\d+$/.test(id);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const unix = () => Math.floor(Date.now() / 1000);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};
const norm = (t: string) =>
  (t || "")
    .toLowerCase()
    .replace(/\(\d{4}\)/g, "")
    .replace(/[^a-z0-9]+/g, "");

/* the verify trick: /verify2 accepts ANY random string as the recaptcha
 * response and sets t_hash_t (~15h). No redirects: the cookie arrives
 * on the 302 itself. */
async function fetchHashT(): Promise<string> {
  const res = await fetch(`${MAIN}/verify.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: NORIG,
      Referer: "https://net77.cc/verify2",
      "User-Agent": UA,
      Accept: "text/html,*/*",
    },
    body: `g-recaptcha-response=${encodeURIComponent(crypto.randomUUID())}`,
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
  const getter = (
    res.headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie;
  const raw: string[] =
    typeof getter === "function"
      ? getter.call(res.headers)
      : [res.headers.get("set-cookie") || ""];
  for (const c of raw) {
    const m = /t_hash_t=([^;]+)/.exec(c || "");
    if (m && m[1]) return m[1];
  }
  return "";
}

async function jget(url: string, jar: string, referer: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/javascript, */*",
      "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
      Referer: referer,
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA,
      Cookie: jar,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
}

type Ep = { id: string; s: number | null; ep: number | null };
const toEp = (e: any): Ep | null =>
  e && e.id
    ? { id: String(e.id), s: num(e.s ?? e.sNum), ep: num(e.ep ?? e.epNum) }
    : null;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;
  const series = kind === "series";
  if (!okKind(kind) || (series ? !okSeriesId(id) : !okMovieId(id))) {
    return NextResponse.json(
      { error: "forbidden", streams: [], captions: [] },
      { status: 403 }
    );
  }
  const title = (req.nextUrl.searchParams.get("title") || "").slice(0, 200);
  if (!title) {
    return NextResponse.json(
      { streams: [], captions: [], laneError: "Search needs a title." },
      { headers: { "cache-control": "no-store" } }
    );
  }
  const parts = id.split(":");
  const s = series ? Number(parts[1]) : 1;
  const e = series ? Number(parts[2]) : 1;
  try {
    const hashT = await fetchHashT();
    if (!hashT) throw new Error("verify trick failed (no t_hash_t)");
    const jar = `t_hash_t=${hashT}; hd=on; ott=nf`;
    await sleep(1200);
    const search = await jget(
      `${MAIN}/mobile/search.php?s=${encodeURIComponent(title)}&t=${unix()}`,
      jar,
      `${MAIN}/home`
    );
    const results: Array<{ id?: string; t?: string }> = Array.isArray(
      search?.searchResult
    )
      ? search.searchResult
      : [];
    const want = norm(title);
    const first =
      results.find((r) => r && r.id && norm(r.t || "") === want && want) ||
      results.find((r) => r && r.id);
    if (!first || !first.id) {
      return NextResponse.json(
        { title, streams: [], captions: [] },
        { headers: { "cache-control": "no-store" } }
      );
    }
    await sleep(1200);
    const post = await jget(
      `${MAIN}/mobile/post.php?id=${encodeURIComponent(first.id)}&t=${unix()}`,
      jar,
      `${MAIN}/home`
    );
    const postTitle: string =
      typeof post?.title === "string" && post.title ? post.title : title;
    let targetId: string = first.id;
    if (series) {
      const eps: Ep[] = [];
      for (const raw of post?.episodes || []) {
        const ep = toEp(raw);
        if (ep) eps.push(ep);
      }
      let found = eps.find((x) => x.s === s && x.ep === e) || null;
      const seasons: Array<{ id?: string }> = Array.isArray(post?.season)
        ? post.season
        : [];
      const seasonIds = [
        ...(post?.nextPageSeason ? [String(post.nextPageSeason)] : []),
        ...seasons
          .map((x) => (x && x.id ? String(x.id) : ""))
          .filter(Boolean),
      ].slice(0, 3);
      for (const sid of seasonIds) {
        if (found) break;
        for (let pg = 1; pg <= 2 && !found; pg++) {
          await sleep(1200);
          try {
            const ej = await jget(
              `${MAIN}/mobile/episodes.php?s=${encodeURIComponent(sid)}&series=${encodeURIComponent(first.id)}&t=${unix()}&page=${pg}`,
              jar,
              `${MAIN}/home`
            );
            for (const raw of ej?.episodes || []) {
              const ep = toEp(raw);
              if (ep) eps.push(ep);
            }
          } catch {
            break;
          }
          found = eps.find((x) => x.s === s && x.ep === e) || null;
        }
      }
      if (!found) {
        return NextResponse.json(
          { title: postTitle, streams: [], captions: [] },
          { headers: { "cache-control": "no-store" } }
        );
      }
      targetId = found.id;
    } else {
      const hasEps = (post?.episodes || []).filter(Boolean).length > 0;
      if (post?.type === "t" || hasEps) {
        return NextResponse.json(
          { title: postTitle, streams: [], captions: [] },
          { headers: { "cache-control": "no-store" } }
        );
      }
      targetId = post?.main_id || first.id;
    }
    await sleep(1200);
    const playRes = await fetch(PLAY, {
      method: "POST",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: NORIG,
        Referer: NREF,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": UA,
        Cookie: jar,
      },
      body: `id=${encodeURIComponent(targetId)}`,
      signal: AbortSignal.timeout(15000),
    });
    const play = await playRes.json().catch(() => null);
    const h: string = play && typeof play.h === "string" ? play.h : "";
    if (!h) throw new Error("play.php minted no token");
    await sleep(1200);
    const plRaw = await jget(
      `${PLAYLIST}?id=${encodeURIComponent(targetId)}&t=${encodeURIComponent(postTitle)}&tm=${unix()}&h=${encodeURIComponent(h)}`,
      jar,
      NREF
    );
    const pl = Array.isArray(plRaw) ? plRaw[0] : plRaw;
    const streams = (Array.isArray(pl?.sources) ? pl.sources : [])
      .filter((x: any) => x && x.file)
      .map((x: any) => {
        const abs = String(x.file).startsWith("http")
          ? String(x.file)
          : `${MAIN}${String(x.file)}`;
        /* HLS rides our proxy: it pins the Referer + session the CDN
         * expects, rewrites segments, and answers CORS for hls.js. The
         * trailing &f=.m3u8 keeps ArtPlayer's type sniff on m3u8. */
        return {
          quality: String(x.label || "Auto").slice(0, 24),
          url: `/api/netmirror/hls?u=${encodeURIComponent(abs)}&f=.m3u8`,
          platform: "HLS",
        };
      });
    const captions = (Array.isArray(pl?.tracks) ? pl.tracks : [])
      .filter(
        (x: any) =>
          x &&
          x.file &&
          (/^captions$/i.test(String(x.kind || "")) ||
            /^subtitles$/i.test(String(x.kind || "")))
      )
      .map((x: any) => {
        const f = String(x.file);
        const abs = f.startsWith("//")
          ? `https:${f}`
          : f.startsWith("http")
            ? f
            : `${SUBCDN}${f.startsWith("/") ? "" : "/"}${f}`;
        const label = String(x.label || x.language || "Subtitle");
        return {
          lang: String(x.language || x.label || "en").slice(0, 12),
          name: label,
          url: `/api/netmirror/sub?u=${encodeURIComponent(abs)}`,
        };
      });
    return NextResponse.json(
      { title: postTitle, streams, captions },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "native flow failed";
    return NextResponse.json(
      { title, streams: [], captions: [], laneError: `Playlists lane: ${msg}` },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
