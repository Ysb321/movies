import { NextRequest, NextResponse } from "next/server";

/* Server 11 (DesiDDL) hub resolver - cracks hub pages into direct files.
 * NOTE (2026-09-09): the client no longer calls this - taps open the hub
 * embedded instead (../embed route) because live bot-walls beat
 * server-side cracking; kept intact as the cracking API for later.
 * Verified live 2026-09-09 against real pages (Fight Club 1999 480p,
 * India's Got Latent S02E01 480p):
 *  G-Direct (fastdl.zip/embed?download=): 302 -> dl.php?link={Drive file
 *   on video-downloads.googleusercontent.com} - the link param IS the
 *   direct file, no cracking needed.
 *  V-Cloud/HubCloud: file page (/video/ div.vd link, or `var url` script
 *   - vcloud double-atob, hubcloud plain -, or HubCloud search-recover
 *   /drive/ result links) -> download page -> h2 a.btn buttons (full-doc
 *   anchor fallback): FSLv2 > FSL Server > Download File > Mega Server >
 *   BuzzServer (/download hx-redirect) > 10Gbps (redirect chain, link=
 *   tail) > Pixeldrain (var pxl rewrite).
 *  GDFlix/GDLink (current template has NO FSL/DIRECT buttons): Instant DL
 *   [10GBPS] href = direct CDN file (first lane) > GD Index (?type=1,2)
 *   > FAST CLOUD / ZIPDISK (page is JS-gated "Generate" buttons, so the
 *   static card parse is best-effort; HTML 200s probe dead anyway).
 * Candidates probe in parallel (1-byte Range; 200+HTML counts as dead so
 * footer/about links can never win): first alive in priority order wins;
 * all-dead still returns the first with stale:true. Parse misses fall
 * back to kind:page (user opens the hub manually); only dead hubs and
 * bot-walls return ok:false with a stage code for the client note.
 * SSRF guard: entry host must be a hub host; hops stay https and off
 * localhost/private literals.
 */

export const runtime = "edge";

const URLS_JSON =
  "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json";
const FALLBACK: Record<string, string> = {
  hubcloud: "https://hubcloud.cx",
  vcloud: "https://vcloud.fit",
  gdflix: "https://new3.gdflix.io",
};
const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
};
const HUB_HOST = /(hubcloud|vcloud|gdflix|gdlink|fastdl)/i;
const PRIV = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[)/i;
const CHALLENGE = /(challenge-platform|cf_chl_opt|Just a moment\.\.\.|Attention Required)/i;

let urlCache: { at: number; map: Record<string, string> } = { at: 0, map: {} };
async function latestBase(key: string): Promise<string> {
  const now = Date.now();
  if (!urlCache.at || now - urlCache.at > 4 * 3600 * 1000) {
    try {
      const r = await fetch(URLS_JSON, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j && typeof j === "object") urlCache = { at: now, map: j };
    } catch {
      urlCache = { at: now, map: urlCache.map };
    }
  }
  return (urlCache.map[key] || FALLBACK[key]).replace(/\/$/, "");
}

const strip = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const baseOf = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host}`;
  } catch {
    return "";
  }
};
const abs = (href: string, base: string) =>
  /^https?:\/\//i.test(href) ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
const okHop = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !PRIV.test(x.hostname);
  } catch {
    return false;
  }
};

class Stage extends Error {
  stage: string;
  constructor(stage: string) {
    super(stage);
    this.stage = stage;
  }
}

async function fetchPage(url: string, ms: number, referer = ""): Promise<{ html: string; final: string }> {
  let r: Response;
  try {
    r = await fetch(url, {
      headers: { ...UA, ...(referer ? { Referer: referer } : {}) },
      signal: AbortSignal.timeout(ms),
    });
  } catch {
    throw new Stage("fetch-fail");
  }
  if (r.status === 403) throw new Stage("guarded");
  if (!r.ok) throw new Stage("fetch-fail");
  const html = await r.text();
  if (CHALLENGE.test(html)) throw new Stage("guarded");
  return { html, final: r.url || url };
}

/* Original URL first (posts already carry working mirrors like hubcloud.foo
 * that redirect to canonical); the urls.json base is only a fallback. */
async function fetchPageFresh(url: string, key: string, ms: number) {
  try {
    return await fetchPage(url, ms, baseOf(url));
  } catch (e) {
    if (e instanceof Stage && e.stage === "fetch-fail") {
      const fresh = await latestBase(key);
      const oldBase = baseOf(url);
      if (fresh && oldBase && fresh !== oldBase) {
        return await fetchPage(url.replace(oldBase, fresh), ms, fresh);
      }
    }
    throw e;
  }
}

async function probe(url: string, referer: string): Promise<"alive" | "dead" | "unknown"> {
  try {
    const r = await fetch(url, {
      headers: {
        Range: "bytes=0-0",
        "User-Agent": UA["User-Agent"],
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(12000),
    });
    if (r.status === 206 || r.status === 416) return "alive";
    if (r.status === 403 || r.status === 404 || r.status === 410) return "dead";
    if (r.status === 200) {
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) return "dead";
      return "alive";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/* resolveFinalUrl: HEAD chain, like CSX (then the 10Gbps link= tail) */
async function resolveFinal(startUrl: string): Promise<string | null> {
  let cur = startUrl;
  for (let i = 0; i < 7; i++) {
    let loc = "";
    try {
      const r = await fetch(cur, {
        method: "HEAD",
        redirect: "manual",
        headers: UA,
        signal: AbortSignal.timeout(8000),
      });
      loc = r.headers.get("location") || "";
    } catch {
      return null;
    }
    if (!loc) break;
    cur = abs(loc, baseOf(cur));
    if (!okHop(cur)) return null;
  }
  if (cur.includes("link=")) cur = cur.substring(cur.indexOf("link=") + 5);
  return cur;
}

type Cand = { url: string; server: string };

/* G-Direct: fastdl.zip/embed?download= -> dl.php?link={Drive file} */
async function gdirectResolve(entry: string): Promise<{ cands: Cand[]; file: string; size: string }> {
  const { html, final } = await fetchPage(entry, 15000, baseOf(entry));
  try {
    const link = new URL(final).searchParams.get("link") || "";
    if (/^https:\/\//i.test(link) && okHop(link)) {
      return { cands: [{ url: link, server: "G-Direct" }], file: "", size: "" };
    }
  } catch {
    /* fall through to the in-page hunt */
  }
  let url = /https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*googleusercontent\.com[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*/i.exec(html)?.[0] || "";
  if (!url) {
    const enc = /[?&]link=(https?%3A[^"'\s&]+)/i.exec(html)?.[1] || "";
    if (enc) {
      try {
        url = decodeURIComponent(enc);
      } catch {
        url = "";
      }
    }
  }
  if (url && okHop(url)) {
    return { cands: [{ url, server: "G-Direct" }], file: "", size: "" };
  }
  throw new Stage("no-link");
}

async function hubResolve(entry: string): Promise<{ cands: Cand[]; file: string; size: string }> {
  const key = /vcloud/i.test(entry) ? "vcloud" : "hubcloud";
  const first = await fetchPageFresh(entry, key, 15000);
  let html = first.html;
  let final = first.final;
  let base = baseOf(final);
  /* page 1 -> file page (<=3 hops: search-recover /drive/ results first,
   * then /video/ or the var-url script, all judged on the FINAL url). */
  let filePage = "";
  for (let hop = 0; hop < 3 && !filePage; hop++) {
    if (final.includes("/video/")) {
      const m = /<div[^>]*class="[^"]*\bvd\b[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i.exec(html);
      if (m?.[1]) {
        filePage = abs(m[1], base);
        break;
      }
    }
    const scripts: string[] = [];
    for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (m[1].includes("url")) scripts.push(m[1]);
    }
    const blob = scripts.join("\n");
    if (/vcloud/i.test(final)) {
      const m = /var\s+url\s*=\s*atob\s*\(\s*atob\s*\(\s*['"]([^'"]+)['"]/i.exec(blob);
      if (m) {
        try {
          filePage = atob(atob(m[1]));
          break;
        } catch {
          /* keep hunting */
        }
      }
    } else {
      const link = /var url = '([^']*)'/.exec(blob)?.[1] || "";
      if (link) {
        filePage = link;
        break;
      }
    }
    const drive = /href="([^"]*\/drive\/[A-Za-z0-9_-]{6,}[^"]*)"/i.exec(html)?.[1] || "";
    if (drive) {
      const p2 = await fetchPage(abs(drive, base), 15000, final);
      html = p2.html;
      final = p2.final;
      base = baseOf(final);
      continue;
    }
    break;
  }
  if (!filePage) throw new Stage("no-link");
  const page2 = await fetchPage(abs(filePage, base), 15000, final);
  html = page2.html;
  base = baseOf(page2.final);
  const file = strip(/<div[^>]*class="[^"]*card-header[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] || "");
  const size = strip(/<i[^>]*id="size"[^>]*>([\s\S]*?)<\/i>/i.exec(html)?.[1] || "");
  /* h2 a.btn buttons (either attr order), else any matching anchor */
  const btns: { href: string; text: string }[] = [];
  for (const h of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) {
    for (const a of h[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (!/class\s*=\s*"[^"]*btn/i.test(a[1])) continue;
      const href = /href\s*=\s*"([^"]+)"/i.exec(a[1])?.[1] || "";
      if (href) btns.push({ href, text: strip(a[2]) });
    }
  }
  if (!btns.length) {
    for (const a of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = /href\s*=\s*"([^"]+)"/i.exec(a[1])?.[1] || "";
      const text = strip(a[2]);
      if (href && /FSLv2|FSL Server|Download File|Mega Server|BuzzServer|10Gbps|pixeldra/i.test(text)) {
        btns.push({ href, text });
      }
    }
  }
  const cands: Cand[] = [];
  const direct = (re: RegExp, server: string) => {
    const b = btns.find((x) => re.test(x.text));
    if (b) cands.push({ url: abs(b.href, base), server });
  };
  direct(/FSLv2/i, "FSLv2");
  direct(/FSL Server/i, "FSL");
  direct(/Download File/i, "Download");
  direct(/Mega Server/i, "Mega");
  /* BuzzServer: hx-redirect dance */
  const buzz = btns.find((x) => /BuzzServer/i.test(x.text));
  if (buzz) {
    try {
      const br = await fetch(`${abs(buzz.href, base)}/download`, {
        redirect: "manual",
        headers: { ...UA, Referer: abs(buzz.href, base) },
        signal: AbortSignal.timeout(10000),
      });
      const hx = br.headers.get("hx-redirect") || "";
      if (hx) cands.push({ url: abs(hx, baseOf(abs(buzz.href, base))), server: "BuzzServer" });
    } catch {
      /* skip */
    }
  }
  /* 10Gbps: redirect chain */
  const ten = btns.find((x) => /Server\s*:\s*10Gbps/i.test(x.text));
  if (ten) {
    const fin = await resolveFinal(abs(ten.href, base));
    if (fin) cands.push({ url: fin, server: "10Gbps" });
  }
  /* Pixeldrain: var pxl rewrite */
  if (btns.some((x) => /pixeldra/i.test(x.href))) {
    const pxl = /var\s+pxl\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] || "";
    if (pxl) {
      const bl = baseOf(pxl);
      cands.push({
        url: /download/i.test(pxl) ? pxl : `${bl}/api/file/${pxl.substring(pxl.lastIndexOf("/") + 1)}?download`,
        server: "Pixeldrain",
      });
    }
  }
  return { cands, file, size };
}

async function gdflixResolve(entry: string): Promise<{ cands: Cand[]; file: string; size: string }> {
  const page = await fetchPageFresh(entry, "gdflix", 15000);
  const html = page.html;
  const base = baseOf(page.final);
  const file =
    strip(/<li[^>]*class="[^"]*list-group-item[^"]*"[^>]*>\s*Name\s*:\s*([^<]+)/i.exec(html)?.[1] || "");
  const size =
    strip(/<li[^>]*class="[^"]*list-group-item[^"]*"[^>]*>\s*Size\s*:\s*([^<]+)/i.exec(html)?.[1] || "");
  const btns: { href: string; text: string }[] = [];
  for (const d of html.matchAll(
    /<div[^>]*class="[^"]*text-center[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  )) {
    for (const a of d[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = /href\s*=\s*"([^"]+)"/i.exec(a[1])?.[1] || "";
      if (href) btns.push({ href, text: strip(a[2]) });
    }
  }
  if (!btns.length) {
    for (const a of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = /href\s*=\s*"([^"]+)"/i.exec(a[1])?.[1] || "";
      if (href) btns.push({ href, text: strip(a[2]) });
    }
  }
  const cands: Cand[] = [];
  const direct = (re: RegExp, server: string) => {
    const b = btns.find((x) => re.test(x.text));
    if (b) cands.push({ url: abs(b.href, base), server });
  };
  direct(/FSL V2/i, "FSL V2");
  direct(/DIRECT (DL|SERVER)/i, "Direct");
  direct(/CLOUD DOWNLOAD \[R2\]/i, "Cloud R2");
  /* Instant DL: current GDFlix pages link the CDN file directly (older
   * ones redirect with a url= tail) - take the href AND the dance. */
  const inst = btns.find((x) => /Instant DL/i.test(x.text));
  if (inst) {
    const href = abs(inst.href, base);
    cands.push({ url: href, server: "Instant" });
    try {
      const ir = await fetch(href, {
        redirect: "manual",
        headers: UA,
        signal: AbortSignal.timeout(10000),
      });
      const loc = ir.headers.get("location") || "";
      if (loc.includes("url=")) {
        const u2 = loc.substring(loc.indexOf("url=") + 4);
        if (u2 && u2 !== href) cands.push({ url: u2, server: "Instant" });
      }
    } catch {
      /* href stands alone */
    }
  }
  /* GD Index: ?type=1,2 -> a.btn-success */
  const gdi = btns.find((x) => /GD Index/i.test(x.text));
  if (gdi) {
    for (const t of [1, 2]) {
      try {
        const gr = await fetch(`${abs(gdi.href, base)}?type=${t}`, {
          headers: UA,
          signal: AbortSignal.timeout(10000),
        });
        const gh = await gr.text();
        for (const a of gh.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
          if (!/class\s*=\s*"[^"]*btn-success/i.test(a[1])) continue;
          const href = /href\s*=\s*"([^"]+)"/i.exec(a[1])?.[1] || "";
          if (href) cands.push({ url: abs(href, base), server: "GD Index" });
        }
      } catch {
        /* skip type */
      }
    }
  }
  /* FAST CLOUD: first non-footer link in the card (the live page is a
   * JS-gated Generate button, so this is best-effort only). */
  const fc = btns.find((x) => /FAST CLOUD/i.test(x.text));
  if (fc) {
    try {
      const fp = await fetchPage(abs(fc.href, base), 10000, page.final);
      const card =
        /<div[^>]*class="[^"]*card-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(fp.html)?.[1] || fp.html;
      const links: string[] = [];
      for (const a of card.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/gi)) {
        const href = a[1];
        if (/^\s*(#|javascript:)/i.test(href)) continue;
        if (/\/(about|privacy|terms|contact|copyright|dmca|login|page)(\/|$)/i.test(href)) continue;
        links.push(href);
      }
      const fbase = baseOf(page.final);
      const best =
        links.find((h) => /^https?:\/\//i.test(h) && baseOf(h) !== fbase) ||
        links.find((h) => /download|file|\/dl|get/i.test(h)) ||
        links[0];
      if (best) cands.push({ url: abs(best, fbase), server: "Fast Cloud" });
    } catch {
      /* skip */
    }
  }
  /* Pixeldrain: rewrite from the link itself */
  const px = btns.find((x) => /pixeldra/i.test(x.href));
  if (px) {
    const bl = baseOf(px.href);
    cands.push({
      url: /download/i.test(px.href)
        ? px.href
        : `${bl}/api/file/${px.href.substring(px.href.lastIndexOf("/") + 1)}?download`,
      server: "Pixeldrain",
    });
  }
  return { cands, file, size };
}

export async function GET(req: NextRequest) {
  const entry = req.nextUrl.searchParams.get("url") || "";
  let host = "";
  try {
    const u = new URL(entry);
    if (u.protocol !== "https:") throw new Error("scheme");
    host = u.hostname;
  } catch {
    return NextResponse.json({ ok: false, error: "bad url" }, { status: 403 });
  }
  if (!HUB_HOST.test(host) || PRIV.test(host)) {
    return NextResponse.json({ ok: false, error: "not a hub link" }, { status: 403 });
  }
  try {
    const { cands, file, size } = /fastdl/i.test(host)
      ? await gdirectResolve(entry)
      : /(gdflix|gdlink)/i.test(host)
        ? await gdflixResolve(entry)
        : await hubResolve(entry);
    if (!cands.length) {
      return NextResponse.json({ ok: true, kind: "page", url: entry });
    }
    const verdicts = await Promise.all(cands.map((c) => probe(c.url, entry)));
    const pick = (i: number, stale: boolean) => ({
      ok: true,
      kind: "file",
      url: cands[i].url,
      server: cands[i].server,
      filename: file,
      size,
      stale,
    });
    const alive = verdicts.findIndex((v) => v === "alive");
    if (alive >= 0) return NextResponse.json(pick(alive, false));
    const unk = verdicts.findIndex((v) => v === "unknown");
    if (unk >= 0) return NextResponse.json(pick(unk, false));
    return NextResponse.json(pick(0, true));
  } catch (e) {
    if (e instanceof Stage && (e.stage === "no-link" || e.stage === "no-buttons")) {
      return NextResponse.json({ ok: true, kind: "page", url: entry });
    }
    const stage = e instanceof Stage ? e.stage : "error";
    return NextResponse.json({ ok: false, error: stage }, { status: 502 });
  }
}
