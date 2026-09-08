/* CloudStream (cs3) provider ports.
 * vegamovies / moviesdrive / moviesmod are 1:1 ports of the Megix
 * (CSX) repo Kotlin sources; hdhub4u + 4khdhub cover Phisher-repo
 * providers; moviezwap covers the CNC-Verse provider. All sites are
 * the "vegamovies family": wordpress post -> quality sections ->
 * host pages (V-Cloud/HubCloud cards, GDFlix) -> direct links. */
import { rawGet, rawGetJson, csxUrls, absolutize, Budget, firstAliveBase } from "./http";
import * as cheerio from "cheerio";

export type CsPost = { title: string; link: string };
export type CsLink = { link: string; text: string };
export type CsProvider = {
  value: string;
  name: string;
  domains: string[];
  urlsKey?: string; // CSX urls.json override
  search(query: string, budget: Budget): Promise<CsPost[]>;
  /** host-page links (vcloud/hubcloud/gdflix/...) for the wanted ep */
  hostLinks(
    post: CsPost,
    opts: { type: "movie" | "tv"; season: number; episode: number },
    budget: Budget
  ): Promise<string[]>;
};

const $n = (html: string) => cheerio.load(html);

/* try each base; remember the last error so dead searches surface in
 * debug instead of silently reporting "0 posts" */
async function trySearch(
  bases: string[],
  fn: (base: string) => Promise<CsPost[]>
): Promise<CsPost[]> {
  let lastErr = "no bases";
  for (const b of bases) {
    if (!b) continue;
    try {
      return await fn(b);
    } catch (e: any) {
      lastErr = String(e?.message ?? e).slice(0, 100);
    }
  }
  throw new Error(`all bases failed (${lastErr})`);
}

/* search.php JSON family (vegamovies + moviesdrive): hits[].document
 * keys come in snake_case AND camelCase; permalinks may be relative */
const searchPhp = async (base: string, query: string, budget: Budget): Promise<CsPost[]> => {
  const j = await rawGetJson<any>(
    `${base}/search.php?q=${encodeURIComponent(query)}&page=1`,
    budget
  );
  const hits: any[] = j?.hits ?? j?.results ?? [];
  return hits
    .map((h) => {
      const d = h?.document ?? h;
      return {
        title: String(d?.post_title ?? d?.postTitle ?? ""),
        link: absolutize(String(d?.permalink ?? d?.url ?? ""), base),
      };
    })
    .filter((p) => p.title && /^https?:/.test(p.link));
};

/* ---------- shared generic crawler (intermediate download pages) ---------- */

const HOST_RE = /vcloud|hubcloud|gdflix|gdlink|driveseed|driveleech/i;
const FILE_RE = /\.(mp4|mkv|m3u8|webm)(\?|$)/i;
const INTERMEDIATE_TEXT = /download|quality|480|720|1080|2160|4k|episode|season|online|watch/i;

/* every <a> with some context text, absolutized */
const anchors = ($: cheerio.CheerioAPI, base: string): CsLink[] =>
  $("a[href]")
    .toArray()
    .map((el) => ({
      link: absolutize($(el).attr("href"), base),
      text: `${$(el).text()} ${$(el).parent().text()}`.slice(0, 160),
    }))
    .filter((a) => /^https?:/i.test(a.link));

export const episodeFrom = (t: string): number | null => {
  const m = t.match(/(?:^|[^0-9a-z])(?:e|ep\.?|episode\s*)0*(\d{1,3})(?:[^0-9]|$)/i);
  if (m) return parseInt(m[1], 10);
  return null;
};

/* generic: post page -> direct host links, following up to 3 same-site
 * intermediate "download" pages; TV links filtered by episode */
export async function crawlHostLinks(
  postUrl: string,
  opts: { type: "movie" | "tv"; season: number; episode: number },
  budget: Budget
): Promise<string[]> {
  const html = await rawGet(postUrl, budget);
  const $ = $n(html);
  const base = new URL(postUrl).origin;
  const out: string[] = [];

  const direct = anchors($, base).filter((a) => HOST_RE.test(a.link) || FILE_RE.test(a.link));
  if (opts.type === "tv") {
    const ep = direct.filter((a) => {
      const n = episodeFrom(a.text) ?? episodeFrom(a.link);
      return n === opts.episode;
    });
    out.push(...(ep.length ? ep : direct).map((a) => a.link));
  } else {
    out.push(...direct.map((a) => a.link));
  }

  /* no host links on the post itself -> follow intermediate pages */
  if (!out.length) {
    const seen = new Set<string>();
    const mids = anchors($, base)
      .filter(
        (a) =>
          a.link.startsWith(base) &&
          INTERMEDIATE_TEXT.test(a.text) &&
          !/\.(jpe?g|png|webp|gif|css|js)(\?|$)/i.test(a.link)
      )
      .slice(0, 4);
    for (const mid of mids) {
      if (seen.has(mid.link) || budget.left <= 2) continue;
      seen.add(mid.link);
      try {
        const h2 = await rawGet(mid.link, budget);
        const $2 = $n(h2);
        for (const a of anchors($2, mid.link)) {
          if (HOST_RE.test(a.link) || FILE_RE.test(a.link)) {
            if (opts.type !== "tv") out.push(a.link);
            else {
              const n = episodeFrom(a.text) ?? episodeFrom(a.link);
              if (n === opts.episode || n === null) out.push(a.link);
            }
          }
        }
      } catch {
        /* page dead - keep going */
      }
    }
  }
  return Array.from(new Set(out)).slice(0, 6);
}

/* ---------- vegamovies (CSX port) ---------- */

const vegaSearch = (base: string, query: string, budget: Budget): Promise<CsPost[]> =>
  searchPhp(base, query, budget);

export const vegamovies: CsProvider = {
  value: "vegamovies",
  name: "VegaMovies",
  domains: ["https://vegamovies.mq", "https://new2.vegamovies.futbol", "https://vegamovies.pet"],
  urlsKey: "vegamovies",
  search: async (query, budget) => {
    const urls = await csxUrls(budget);
    const bases = [urls.vegamovies, ...vegamovies.domains].filter(Boolean) as string[];
    return trySearch(bases, (b) => vegaSearch(b, query, budget));
  },
  hostLinks: async (post, opts, budget) => {
    const html = await rawGet(post.link, budget);
    const $ = $n(html);
    const base = new URL(post.link).origin;
    const out: string[] = [];

    if (opts.type === "movie") {
      /* a:has(button.dwd-button) -> page -> a:contains(V-Cloud) */
      const btns = $("a")
        .toArray()
        .filter((el) => $(el).find("button.dwd-button").length)
        .map((el) => absolutize($(el).attr("href"), base))
        .slice(0, 4);
      for (const b of btns) {
        try {
          const $2 = $n(await rawGet(b, budget));
          const src = $2("a")
            .toArray()
            .map((el) => absolutize($2(el).attr("href"), b))
            .find((u) => /vcloud|hubcloud/i.test(u));
          if (src) out.push(src);
        } catch {
          /* dead intermediate */
        }
      }
    } else {
      /* quality h3/h5 tags -> next p's a (V-Cloud/Episode/Download) ->
       * page -> p>a vcloud links; episode = index within the tag */
      const tags = $("main > h3, main > h5")
        .toArray()
        .filter((el) => /(4k|\d{3,4}p)/i.test($(el).text()) && !/zip/i.test($(el).text()));
      for (const tag of tags.slice(0, 3)) {
        const tagText = $(tag).text();
        const season =
          tagText.match(/(?:Season |S)(\d+)/i)?.[1]
            ? parseInt(tagText.match(/(?:Season |S)(\d+)/i)![1], 10)
            : 0;
        if (opts.season && season && season !== opts.season) continue;
        const p = $(tag).next();
        const as = (p && p.is("p") ? p.find("a") : $(tag).find("a")).toArray();
        const uni = as
          .map((el) => ({ href: absolutize($(el).attr("href"), base), text: $(el).text() }))
          .find(
            (a) =>
              /v-?cloud|episode|download/i.test(a.text) ||
              (/g-?direct/i.test(a.text) && false)
          );
        if (!uni?.href) continue;
        try {
          const $2 = $n(await rawGet(uni.href, budget));
          const vc = $2("p > a")
            .toArray()
            .map((el) => absolutize($2(el).attr("href"), uni.href))
            .filter((u) => /vcloud|hubcloud/i.test(u));
          /* episode = position in this quality's list */
          const pick = vc[opts.episode - 1] ?? vc[0];
          if (pick) out.push(pick);
        } catch {
          /* dead */
        }
      }
    }
    if (!out.length) return crawlHostLinks(post.link, opts, budget);
    return out.slice(0, 4);
  },
};

/* ---------- moviesdrive (CSX port) ---------- */

const mdSearch = (base: string, query: string, budget: Budget): Promise<CsPost[]> =>
  searchPhp(base, query, budget);

export const moviesdrive: CsProvider = {
  value: "moviesdrive",
  name: "MoviesDrive",
  domains: ["https://moviesdrive.forum", "https://new3.moviesdrive.christmas", "https://moviesdrive.zone"],
  urlsKey: "moviesdrive",
  search: async (query, budget) => {
    const urls = await csxUrls(budget);
    const bases = [urls.moviesdrive, ...moviesdrive.domains].filter(Boolean) as string[];
    return trySearch(bases, (b) => mdSearch(b, query, budget));
  },
  hostLinks: async (post, opts, budget) => {
    const html = await rawGet(post.link, budget);
    const $ = $n(html);
    const base = new URL(post.link).origin;
    const out: string[] = [];

    /* h5 > a (skip Zip) -> intermediate -> hubcloud/gdflix links */
    const btns = $("h5 > a")
      .toArray()
      .map((el) => absolutize($(el).attr("href"), base))
      .filter((u) => /^https?:/.test(u))
      .filter((u) => !/zip/i.test(u))
      .slice(0, 4);

    for (const b of btns) {
      try {
        const $2 = $n(await rawGet(b, budget));
        const links = anchors($2, b).filter((a) => HOST_RE.test(a.link));
        if (opts.type === "tv") {
          const ep = links.filter((a) => {
            const n = episodeFrom(a.text) ?? episodeFrom(a.link);
            return n === opts.episode;
          });
          out.push(...(ep.length ? ep : links).map((a) => a.link));
        } else {
          out.push(...links.map((a) => a.link));
        }
      } catch {
        /* dead */
      }
    }
    if (!out.length) return crawlHostLinks(post.link, opts, budget);
    return Array.from(new Set(out)).slice(0, 4);
  },
};

/* ---------- moviesmod / moviesleech (CSX port) ---------- */

const mmParse = (html: string, base: string): CsPost[] => {
  const $ = $n(html);
  const from = $("div.post-cards > article a, article a, h2 a, h3 a")
    .toArray()
    .map((el) => ({
      link: absolutize($(el).attr("href"), base),
      title: ($(el).attr("title") ?? $(el).text() ?? "").replace(/^Download\s+/i, ""),
    }))
    .filter((p) => p.title.length > 3 && /^https?:/.test(p.link))
    .slice(0, 12);
  return from;
};

const mmSearch = async (base: string, query: string, budget: Budget): Promise<CsPost[]> => {
  /* theme A: /search/<q>/page/1 (moviesleech style) */
  try {
    const r = mmParse(await rawGet(`${base}/search/${encodeURIComponent(query)}/page/1`, budget), base);
    if (r.length) return r;
  } catch {
    /* theme B below */
  }
  /* theme B: plain wordpress ?s= */
  return mmParse(await rawGet(`${base}/?s=${encodeURIComponent(query)}`, budget), base);
};

export const moviesmod: CsProvider = {
  value: "moviesmod",
  name: "Moviesmod",
  domains: ["https://moviesleech.rest", "https://moviesleech.art", "https://moviesmod.zone"],
  urlsKey: "moviesmod",
  search: async (query, budget) => {
    const urls = await csxUrls(budget);
    const bases = [
      urls.moviesmod,
      urls.topmovies,
      ...moviesmod.domains,
    ].filter(Boolean) as string[];
    return trySearch(bases, (b) => mmSearch(b, query, budget));
  },
  hostLinks: async (post, opts, budget) => {
    const html = await rawGet(post.link, budget);
    const $ = $n(html);
    const base = new URL(post.link).origin;
    const dec = (u: string) => {
      const m = u.match(/[?&]url=([^&]+)/);
      if (m) {
        try {
          return Buffer.from(decodeURIComponent(m[1]), "base64").toString("utf8");
        } catch {
          return u;
        }
      }
      return u;
    };
    const out: string[] = [];

    if (opts.type === "movie") {
      const btns = $("a.maxbutton-download-links")
        .toArray()
        .map((el) => dec(absolutize($(el).attr("href"), base)))
        .filter((u) => /^https?:/.test(u))
        .slice(0, 4);
      for (const b of btns) {
        try {
          const $2 = $n(await rawGet(b, budget));
          const src =
            $2("a.maxbutton-1").attr("href") ?? $2("a.maxbutton-5").attr("href") ?? "";
          if (src) out.push(absolutize(src, b));
        } catch {
          /* dead */
        }
      }
    } else {
      const btns = $("a.maxbutton-episode-links, a.maxbutton-g-drive, a.maxbutton-af-download")
        .toArray()
        .map((el) => ({
          link: dec(absolutize($(el).attr("href"), base)),
          season:
            parseInt(
              ($(el).parent().prev().text().match(/(?:Season |S)(\d+)/i) ?? [])[1] ?? "0",
              10
            ) || 0,
        }))
        .filter((b) => /^https?:/.test(b.link))
        .slice(0, 4);
      for (const b of btns) {
        if (b.season && b.season !== opts.season) continue;
        try {
          const $2 = $n(await rawGet(b.link, budget));
          /* h3/h4 -> a href per episode, in order */
          let e = 0;
          for (const h of $2("h3, h4").toArray()) {
            e++;
            if (e === opts.episode) {
              const href = $2(h).find("a").attr("href");
              if (href) out.push(absolutize(href, b.link));
            }
          }
        } catch {
          /* dead */
        }
      }
    }
    if (!out.length) return crawlHostLinks(post.link, opts, budget);
    return Array.from(new Set(out)).slice(0, 4);
  },
};

/* ---------- hdhub4u (Phisher provider) ---------- */
/* search runs on a Typesense API mirror; post pages follow the same
 * vegamovies-family layout (quality h3 -> download links) */

const hduSearch = async (query: string, budget: Budget): Promise<CsPost[]> => {
  const j = await rawGetJson<any>(
    `https://search.pingora.fyi/collections/post/documents/search?q=${encodeURIComponent(
      query
    )}&query_by=post_title`,
    budget,
    { timeoutMs: 12000 }
  );
  return (j?.results ?? j?.hits ?? [])
    .map((r: any) => ({
      title: String(r?.document?.post_title ?? ""),
      link: String(r?.document?.permalink ?? r?.document?.url ?? ""),
    }))
    .filter((p: CsPost) => p.title && /^https?:/.test(p.link));
};

export const hdhub4u: CsProvider = {
  value: "hdhub4u",
  name: "HDHub4u",
  domains: ["https://hdhub4u.rest", "https://hdhub4u.ltd", "https://hdhub4u.com"],
  search: async (query, budget) => hduSearch(query, budget),
  hostLinks: async (post, opts, budget) => crawlHostLinks(post.link, opts, budget),
};

/* ---------- 4khdhub (Phisher provider) ---------- */

const khSearch = async (base: string, query: string, budget: Budget): Promise<CsPost[]> => {
  const html = await rawGet(`${base}/?s=${encodeURIComponent(query)}`, budget);
  const $ = $n(html);
  return $("article a, .post-title a, h2 a, h3 a")
    .toArray()
    .map((el) => ({
      link: absolutize($(el).attr("href"), base),
      title: ($(el).attr("title") ?? $(el).text() ?? "").trim(),
    }))
    .filter((p) => p.title.length > 3 && /^https?:/.test(p.link) && p.link.includes(base.replace(/\/$/, "")))
    .slice(0, 12);
};

export const khdhub4u: CsProvider = {
  value: "4khdhub",
  name: "4KHDHub",
  domains: ["https://4khdhub.one", "https://4khdhub.pics", "https://4khdhub.fit"],
  search: async (query, budget) => {
    const urls = await csxUrls(budget);
    const bases = [urls["4khdhub"], ...khdhub4u.domains].filter(Boolean) as string[];
    return trySearch(bases, (b) => khSearch(b, query, budget));
  },
  hostLinks: async (post, opts, budget) => crawlHostLinks(post.link, opts, budget),
};

/* ---------- moviezwap (CNC-Verse provider) ---------- */

const mwSearch = async (base: string, query: string, budget: Budget): Promise<CsPost[]> => {
  const html = await rawGet(`${base}/search.php?q=${encodeURIComponent(query)}`, budget);
  const $ = $n(html);
  return $("a")
    .toArray()
    .map((el) => ({
      link: absolutize($(el).attr("href"), base),
      title: ($(el).attr("title") ?? $(el).text() ?? "").trim(),
    }))
    .filter((p) => p.title.length > 3 && /^https?:/.test(p.link))
    .filter((p) => /20\d\d|season/i.test(p.title) || p.link.includes(base.replace(/\/$/, "")))
    .slice(0, 12);
};

export const moviezwap: CsProvider = {
  value: "moviezwap",
  name: "MoviezWap",
  domains: ["https://www.moviezwap.best", "https://moviezwap.best"],
  search: async (query, budget) => {
    return trySearch(moviezwap.domains, (b) => mwSearch(b, query, budget));
  },
  hostLinks: async (post, opts, budget) => crawlHostLinks(post.link, opts, budget),
};

export const CS_PROVIDERS: CsProvider[] = [
  vegamovies,
  moviesdrive,
  moviesmod,
  hdhub4u,
  khdhub4u,
  moviezwap,
];
