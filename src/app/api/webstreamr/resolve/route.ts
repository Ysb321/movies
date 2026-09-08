import { NextRequest, NextResponse } from "next/server";

/* Server 9 (WebStreamr) link resolver - turns a stream url into something
 * VLC can play, with no click-through needed. Follows redirects manually
 * (never reading bodies); if the chain ends at an HTML page (HubCloud-style
 * "link generator"), the file link is scraped out of it (query-param
 * handoff first, anchor hrefs second, bare urls in markup third). A cookie
 * jar is kept across hops (generator sessions need it). /extract/ urls get
 * automatic sibling-index fallback (fast <-> direct); every file candidate
 * is verified with a 1-byte Range probe and confirmed-dead links
 * (403/404/410) lose to live ones. Anything still unresolvable comes back
 * as kind:page for the client's open-in-new-tab fallback.
 * Private/local targets are refused (no SSRF). */

export const runtime = "edge";

const MAX_HOPS = 5;
const HOP_TIMEOUT_MS = 12000;
const PROBE_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 512 * 1024;

const blockedHost = (h: string) =>
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|\[?::1?\]?|fd00:|fe80:)/i.test(h) ||
  h.endsWith(".local") ||
  h.endsWith(".internal");

const looksFile = (u: string) => /\.(m3u8|mpd|mp4|mkv|webm|m4v|mov|avi)(\?|#|$)/i.test(u);

/* file-CDN hosts whose links carry no extension (explicit handoffs only) */
const FILE_HOST = /(^|\.)(googleusercontent\.com|googlevideo\.com|drive\.google\.com|dropboxusercontent\.com|gofile\.io|pixeldrain\.com)$/i;

const HREF = /(?:href|data-href|data-url)\s*=\s*["'](https?:\/\/[^"'\s<>]+?)["']/gi;

/* any bare url in markup (onclick handlers, js vars, meta refresh) */
const ANY_URL = /https?:\/\/[^"'\s<>\\]+/g;

/* cookie jar: edge fetch ships no jar, but generator sessions (second
 * visit holds the link, bot-check cookies) need continuity across hops */
const makeJar = () => {
  const jar = new Map<string, string>();
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    collect: (res: Response) => {
      try {
        const getAll = (
          res.headers as unknown as { getSetCookie?: () => string[] }
        ).getSetCookie;
        const raws =
          typeof getAll === "function"
            ? getAll.call(res.headers)
            : [res.headers.get("set-cookie") || ""];
        for (const c of raws) {
          const pair = c.split(";")[0] || "";
          const eq = pair.indexOf("=");
          if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
        }
      } catch {}
    },
  };
};

const json = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

const cancel = async (res: Response) => {
  try {
    await res.body?.cancel();
  } catch {}
};

/** 1-byte liveness probe: alive (206/200/416), dead (403/404/410), or
 *  unknown (anything else - VLC tries anyway) */
async function probeFile(fileUrl: string): Promise<"alive" | "dead" | "unknown"> {
  try {
    const res = await fetch(fileUrl, {
      headers: { Range: "bytes=0-0", accept: "*/*" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const st = res.status;
    try {
      await res.body?.cancel();
    } catch {}
    if (st === 206 || st === 200 || st === 416) return "alive";
    if (st === 403 || st === 404 || st === 410) return "dead";
    return "unknown";
  } catch {
    return "unknown";
  }
}

type Attempt = { file?: string; page?: string };

async function attempt(start: URL): Promise<Attempt> {
  let current = start;
  const seen = new Set<string>();
  const jar = makeJar();
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (seen.has(current.href)) break;
    seen.add(current.href);
    let res: Response;
    try {
      res = await fetch(current.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        headers: { accept: "*/*", ...(jar.header() ? { cookie: jar.header() } : {}) },
      });
    } catch {
      return {};
    }
    jar.collect(res);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      let next: URL;
      try {
        next = new URL(loc, current.href);
      } catch {
        await cancel(res);
        break;
      }
      if (!/^https?:$/.test(next.protocol) || blockedHost(next.hostname)) {
        await cancel(res);
        break;
      }
      if (looksFile(next.href)) {
        await cancel(res);
        return { file: next.href };
      }
      await cancel(res);
      current = next;
      continue;
    }
    if (res.status >= 200 && res.status < 300) {
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const len = Number(res.headers.get("content-length") || "0");
      if (!ct.includes("text/html") || len > MAX_HTML_BYTES) {
        await cancel(res);
        return { file: current.href };
      }
      const html = await res.text();
      /* 1) explicit query-param handoff (HubCloud gamerxyt ?link=...) */
      for (const k of ["link", "url", "file", "download", "src"]) {
        const v = current.searchParams.get(k);
        if (v && /^https?:\/\//i.test(v)) {
          try {
            const u = new URL(v);
            if (!blockedHost(u.hostname) && (looksFile(u.href) || FILE_HOST.test(u.hostname))) {
              return { file: u.href };
            }
          } catch {}
        }
      }
      /* 2) anchor hrefs, then 3) bare urls anywhere in the markup */
      const links: string[] = [];
      const take = (href: string) => {
        try {
          const u = new URL(href);
          if (
            /^https?:$/.test(u.protocol) &&
            !blockedHost(u.hostname) &&
            (looksFile(u.href) || FILE_HOST.test(u.hostname)) &&
            !links.includes(u.href)
          ) {
            links.push(u.href);
          }
        } catch {}
      };
      for (const m of html.matchAll(HREF)) {
        if (links.length >= 10) break;
        take(m[1]);
      }
      for (const m of html.matchAll(ANY_URL)) {
        if (links.length >= 10) break;
        take(m[0].replace(/[).,;!?]+$/, ""));
      }
      if (links.length) return { file: links[0] };
      return { page: current.href };
    }
    await cancel(res);
    break;
  }
  return { page: current.href };
}

/** candidates to try: /extract/ urls also try the sibling index
 *  (fast <-> direct), since either side can be quota-dead. */
function candidates(input: URL): URL[] {
  const out = [input];
  try {
    if (input.pathname.includes("/extract")) {
      const idx = input.searchParams.get("index");
      if (idx === "0" || idx === "1") {
        const sib = new URL(input.href);
        sib.searchParams.set("index", idx === "0" ? "1" : "0");
        out.push(sib);
      }
    }
  } catch {}
  return out;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") || "";
  let input: URL;
  try {
    input = new URL(raw);
  } catch {
    return json({ ok: false, error: "bad url" }, 400);
  }
  if (!/^https?:$/.test(input.protocol) || blockedHost(input.hostname)) {
    return json({ ok: false, error: "refused target" }, 403);
  }
  let firstPage: string | null = null;
  const dead: string[] = [];
  for (const cand of candidates(input)) {
    if (!/^https?:$/.test(cand.protocol) || blockedHost(cand.hostname)) continue;
    const r = await attempt(cand);
    if (r.file) {
      const health = await probeFile(r.file);
      if (health !== "dead")
        return json({ ok: true, kind: "file", url: r.file, links: [] });
      dead.push(r.file);
      continue; /* sibling may be alive */
    }
    if (r.page && !firstPage) firstPage = r.page;
  }
  if (dead.length) {
    /* every file found is confirmed dead - hand the first back anyway with
     * a stale flag (quotas lift; VLC was going to try regardless) */
    return json({ ok: true, kind: "file", url: dead[0], links: [], stale: true });
  }
  if (firstPage) return json({ ok: true, kind: "page", url: firstPage, links: [] });
  return json({ ok: false, error: "couldn't generate a playable link" }, 502);
}
