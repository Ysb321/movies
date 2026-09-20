import { NextRequest, NextResponse } from "next/server";
import {
  SITE,
  ensureIndex,
  fetchJson,
  matchSlugs,
  m2boxHeaders,
  searchSlugs,
  slugIndex,
  toRows,
  verifySubject,
  words,
} from "@/lib/m2boxCore";

/* Server 26 - M2Box (m2box.org, the MovieBox web build). vlcOnly lane:
 * the watch page renders HindiSources with endpoint=/api/m2box/stream.
 * Protocol + title-matching details live in @/lib/m2boxCore. */

export const runtime = "edge"; // required by Cloudflare Pages (next-on-pages), like every lane

const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/* in-memory result cache: play is rate-limited upstream, so repeat taps
 * (and multi-user hits) reuse a fresh result for a few minutes */
const cache = new Map<string, { at: number; body: any }>();
const CACHE_TTL = 3 * 60 * 1000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;
  const type = kind === "movie" ? "movie" : "series";
  /* id arrives as "tmdb:{id}" or "tmdb:{id}:{s}:{e}" (lane convention;
   * plain "{id}" / "{id}:{s}:{e}" / "tt..." also accepted) */
  const parts = decodeURIComponent(id).split(":").filter(Boolean);
  const off = parts[0] === "tmdb" ? 1 : 0;
  const tmdbId = parts[off] || "";
  const seRaw = parts[off + 1] || "0";
  const epRaw = parts[off + 2] || "0";
  const season = Math.max(0, parseInt(seRaw, 10) || 0);
  const episode = Math.max(0, parseInt(epRaw, 10) || 0);

  const title = (req.nextUrl.searchParams.get("title") || "").trim();
  const origTitle = (req.nextUrl.searchParams.get("ot") || "").trim();
  const year = (req.nextUrl.searchParams.get("year") || "").slice(0, 4);
  const diag: string[] = [];

  if (!/^(tt\d+|\d+)$/.test(tmdbId) || (type === "series" && !episode)) {
    return json({ streams: [], captions: [] }, 403);
  }

  const cacheKey = `${type}:${tmdbId}:${season}:${episode}:${words(title)}:${year}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return json(hit.body);

  try {
    if (!title) {
      return json({ streams: [], captions: [], laneError: "M2Box needs a title to search — try another server." });
    }

    /* cheap index first (snapshot restore or featured home+trending rows,
     * ~2 upstream calls): most requests — popular titles especially — match
     * here with subrequest budget left for detail+play (Cloudflare's free
     * plan caps an invocation at 50 subrequests; one full-catalog build
     * used to eat all of them and then fail every detail call) */
    await ensureIndex(diag, false);

    let slug = "";
    let detail: any;
    let subject: any;
    let transportFail = false;
    const tried = new Set<string>();

    /* walk slug candidates: a JSON error body = dead slug (stale:, keep
     * walking); null = transport failure (429/timeout/cap) — stop and
     * surface a retryable error instead of burning the other candidates
     * against a throttled upstream */
    const attempt = async (): Promise<boolean> => {
      const candidates = matchSlugs(title, origTitle).filter((c) => !tried.has(c));
      if (!candidates.length) {
        diag.push("match:none");
        return false;
      }
      diag.push(`match:${candidates[0].slice(0, 24)}`);
      for (const cand of candidates) {
        tried.add(cand);
        const d = await fetchJson(
          `${SITE}/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(cand)}`,
          m2boxHeaders(cand)
        );
        if (d === null) {
          transportFail = true;
          diag.push(`fetch-fail:${cand.slice(0, 16)}`);
          return false;
        }
        const s = d?.data?.subject;
        if (d?.code !== 0 || !s?.subjectId) {
          diag.push(`stale:${cand.slice(0, 16)}`);
          continue;
        }

        /* verify the match against the real title (slug prefixes like
         * "trjm-rby" can create false contains-hits) */
        if (!verifySubject(s, title, origTitle, year)) {
          diag.push(`skip:${cand.slice(0, 16)}`);
          continue;
        }
        slug = cand;
        detail = d;
        subject = s;
        return true;
      }
      return false;
    };

    let found = await attempt();
    if (!found && !transportFail) {
      /* m2box's own SSR keyword search (fresh, 1 call): finds movies AND TV
       * even when the slug index is stale or missing the title */
      const searched = await searchSlugs(title, diag);
      if (searched.length) {
        diag.push(`match:${searched[0].slice(0, 24)}`);
        for (const cand of searched) {
          if (tried.has(cand)) continue;
          tried.add(cand);
          const d = await fetchJson(
            `${SITE}/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(cand)}`,
            m2boxHeaders(cand)
          );
          if (d === null) {
            transportFail = true;
            diag.push(`fetch-fail:${cand.slice(0, 16)}`);
            break;
          }
          const s = d?.data?.subject;
          if (d?.code !== 0 || !s?.subjectId) {
            diag.push(`stale:${cand.slice(0, 16)}`);
            continue;
          }
          if (!verifySubject(s, title, origTitle, year)) {
            diag.push(`skip:${cand.slice(0, 16)}`);
            continue;
          }
          slug = cand;
          detail = d;
          subject = s;
          found = true;
          break;
        }
      }
    }
    if (!found && !transportFail) {
      /* full catalog (movie sitemaps + TV/anime lists) — only pays the big
       * upstream cost when search + cheap index both had no verified match */
      await ensureIndex(diag, true);
      if (slugIndex.size) found = await attempt();
    }

    if (!slug || !subject) {
      if (transportFail || !slugIndex.size) {
        return json({
          streams: [],
          captions: [],
          laneError: "M2Box is unreachable right now — tap Retry to search again.",
          diag: diag.join(" "),
        });
      }
      const body = {
        streams: [],
        captions: [],
        noSource: true,
        title,
        diag: `${diag.join(" ")} verify:fail`,
      };
      cache.set(cacheKey, { at: Date.now(), body });
      return json(body);
    }

    /* se/ep resolution: movies play at se=0&ep=0; series use resource
     * seasons (se starts at 1 there) clamped to what exists */
    let playSe = 0;
    let playEp = 0;
    if (type === "series") {
      const seasons: any[] = detail?.data?.resource?.seasons || [];
      const real =
        seasons.find((x) => x?.se === season) ||
        seasons.find((x) => x?.se === 1) ||
        seasons[0];
      playSe = real?.se ?? season;
      const maxEp = Number(real?.maxEp || 0);
      playEp = maxEp ? Math.min(Math.max(episode, 1), maxEp) : Math.max(episode, 1);
    }

    const play = await fetchJson(
      `${SITE}/wefeed-h5api-bff/subject/play?subjectId=${subject.subjectId}&se=${playSe}&ep=${playEp}&detailPath=${encodeURIComponent(slug)}`,
      m2boxHeaders(slug),
      15000
    );
    const data = play?.data;
    const rows =
      play?.code === 0 && data?.hasResource !== false
        ? toRows(data?.streams || [], data?.hls || [], String(detail?.data?.resource?.source || ""))
        : [];

    if (!rows.length) {
      const body = {
        streams: [],
        captions: [],
        noSource: true,
        title: subject.title || title,
        diag: `${diag.join(" ")} play:${play?.code === 0 ? "empty" : "fail"}`,
      };
      cache.set(cacheKey, { at: Date.now(), body });
      return json(body);
    }

    /* Hindi rows first, then quality desc (addonRowSort reads the label) */
    rows.sort((a, b) => {
      const aHi = /hindi/i.test(a.description) ? 0 : 1;
      const bHi = /hindi/i.test(b.description) ? 0 : 1;
      if (aHi !== bHi) return aHi - bHi;
      return (parseInt(b.name, 10) || 0) - (parseInt(a.name, 10) || 0) ||
        (parseInt((b.description.match(/(\d{3,4})p/) || [])[1] || "0", 10) -
          parseInt((a.description.match(/(\d{3,4})p/) || [])[1] || "0", 10));
    });

    const body = {
      streams: rows,
      captions: [],
      title: subject.title || title,
      diag: diag.join(" "),
    };
    cache.set(cacheKey, { at: Date.now(), body });
    return json(body);
  } catch {
    return json({
      streams: [],
      captions: [],
      laneError: "M2Box is unreachable right now — tap Retry to search again.",
      diag: diag.join(" "),
    });
  }
}
