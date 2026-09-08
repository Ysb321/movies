import { NextRequest, NextResponse } from "next/server";

/* Server 9 (WebStreamr) link resolver - turns a stream url into something
 * VLC can play. Follows redirects manually (never reading bodies, so a hop
 * that lands ON the file itself is free); if the chain ends at an HTML
 * page (HubCloud-style "link generator" with a Download button), the file
 * link is scraped out of it (query-param handoff first, anchor hrefs
 * second). Anything that still looks like a page comes back as kind:page
 * and the client embeds it for the click-through flow.
 * Private/local targets are refused (no SSRF into the desktop's own
 * localhost server or cloud metadata endpoints). */

export const runtime = "edge";

const MAX_HOPS = 5;
const HOP_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 512 * 1024;

const blockedHost = (h: string) =>
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|\[?::1?\]?|fd00:|fe80:)/i.test(h) ||
  h.endsWith(".local") ||
  h.endsWith(".internal");

const looksFile = (u: string) => /\.(m3u8|mpd|mp4|mkv|webm|m4v|mov|avi)(\?|#|$)/i.test(u);

/* file-CDN hosts whose links carry no extension (explicit handoffs only) */
const FILE_HOST = /(^|\.)(googleusercontent\.com|googlevideo\.com|drive\.google\.com|dropboxusercontent\.com|gofile\.io|pixeldrain\.com)$/i;

const HREF = /(?:href|data-href|data-url)\s*=\s*["'](https?:\/\/[^"'\s<>]+?)["']/gi;

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

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") || "";
  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    return json({ ok: false, error: "bad url" }, 400);
  }
  if (!/^https?:$/.test(current.protocol) || blockedHost(current.hostname)) {
    return json({ ok: false, error: "refused target" }, 403);
  }

  const seen = new Set<string>();
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (seen.has(current.href)) break;
    seen.add(current.href);
    let res: Response;
    try {
      res = await fetch(current.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        headers: { accept: "*/*" },
      });
    } catch {
      return json({ ok: false, error: hop === 0 ? "source unreachable" : "resolve failed" }, 502);
    }
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
      /* redirect straight onto a file: done without touching the body */
      if (looksFile(next.href)) {
        await cancel(res);
        return json({ ok: true, kind: "file", url: next.href, links: [] });
      }
      await cancel(res);
      current = next;
      continue;
    }
    if (res.status >= 200 && res.status < 300) {
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const len = Number(res.headers.get("content-length") || "0");
      if (!ct.includes("text/html") || len > MAX_HTML_BYTES) {
        /* the file itself (video/octet-stream/...) - never read the body */
        await cancel(res);
        return json({ ok: true, kind: "file", url: current.href, links: [] });
      }
      const html = await res.text();
      /* 1) explicit query-param handoff (HubCloud gamerxyt ?link=...) */
      for (const k of ["link", "url", "file", "download", "src"]) {
        const v = current.searchParams.get(k);
        if (v && /^https?:\/\//i.test(v)) {
          try {
            const u = new URL(v);
            if (!blockedHost(u.hostname) && (looksFile(u.href) || FILE_HOST.test(u.hostname))) {
              return json({ ok: true, kind: "file", url: u.href, links: [] });
            }
          } catch {}
        }
      }
      /* 2) anchor hrefs that are files or file-CDN links (matchAll, not
       * module-level exec: the edge runtime reuses isolates, so a shared
       * /g lastIndex would skip matches on later requests) */
      const links: string[] = [];
      for (const m of html.matchAll(HREF)) {
        if (links.length >= 10) break;
        try {
          const u = new URL(m[1]);
          if (
            /^https?:$/.test(u.protocol) &&
            !blockedHost(u.hostname) &&
            (looksFile(u.href) || FILE_HOST.test(u.hostname)) &&
            !links.includes(u.href)
          ) {
            links.push(u.href);
          }
        } catch {}
      }
      if (links.length) {
        return json({ ok: true, kind: "file", url: links[0], links });
      }
      return json({ ok: true, kind: "page", url: current.href, links: [] });
    }
    await cancel(res);
    break;
  }
  /* fell through: hand back where we got to as a click-through page */
  return json({ ok: true, kind: "page", url: current.href, links: [] });
}
