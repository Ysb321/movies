import { NextRequest, NextResponse } from "next/server";

/* Server 20 (DesiDDL) hub resolver - cracks V-Cloud/HubCloud/GDFlix/GDLink
 * hub pages into direct FSL fast-link files, ported from the Megix CSX
 * extractors (MoviesDrive/VegaMovies Extractors.kt, same code in both):
 *  HubCloud/VCloud: normalize domain via urls.json -> GET page ->
 *   /video/ branch (div.vd > center > a) else script branch (vcloud:
 *   double-atob `var url`, hubcloud: plain `var url`) -> GET page 2 ->
 *   header (div.card-header) + size (i#size) -> h2 a.btn buttons:
 *   FSLv2 > FSL Server > Download File > Mega Server > BuzzServer
 *   ({link}/download hx-redirect) > 10Gbps (redirect chain, link= tail)
 *   > Pixeldrain (var pxl rewrite). (Gofile skipped: API dance.)
 *  GDFlix/GDLink: Name/Size li's -> div.text-center buttons: FSL V2 >
 *   DIRECT DL/SERVER > CLOUD DOWNLOAD [R2] > GD Index (?type=1,2 ->
 *   a.btn-success) > FAST CLOUD (card-body a) > Instant DL (location
 *   after url=) > Pixeldrain (link rewrite).
 * Candidates probe in order (1-byte Range): first alive wins; all-dead
 * still returns the first with stale:true (VLC may still try it).
 * SSRF guard: entry host must be a hub host; redirect hops stay https
 * and off localhost/private literals.
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
const HUB_HOST = /(hubcloud|vcloud|gdflix|gdlink)/i;
const PRIV = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[)/i;

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

async function probe(url: string): Promise<"alive" | "dead" | "unknown"> {
  try {
    const r = await fetch(url, {
      headers: { Range: "bytes=0-0", "User-Agent": UA["User-Agent"] },
      signal: AbortSignal.timeout(12000),
    });
    if (r.status === 206 || r.status === 200 || r.status === 416) return "alive";
    if (r.status === 403 || r.status === 404 || r.status === 410) return "dead";
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

async function hubResolve(entry: string): Promise<{ cands: Cand[]; file: string; size: string }> {
  const key = /vcloud/i.test(entry) ? "vcloud" : "hubcloud";
  const fresh = await latestBase(key);
  const oldBase = baseOf(entry);
  const url = oldBase && fresh !== oldBase ? entry.replace(oldBase, fresh) : entry;
  const base = baseOf(url);
  const r1 = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  const doc = await r1.text();
  let link = "";
  if (url.includes("/video/")) {
    const m = /<div[^>]*class="[^"]*\bvd\b[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i.exec(doc);
    link = m?.[1] || "";
  } else {
    const scripts: string[] = [];
    for (const m of doc.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (m[1].includes("url")) scripts.push(m[1]);
    }
    const blob = scripts.join("\n");
    if (/vcloud/i.test(url)) {
      const m = /var\s+url\s*=\s*atob\s*\(\s*atob\s*\(\s*['"]([^'"]+)['"]/i.exec(blob);
      if (m) {
        try {
          link = atob(atob(m[1]));
        } catch {
          link = "";
        }
      }
    } else {
      link = /var url = '([^']*)'/.exec(blob)?.[1] || "";
    }
  }
  if (!link) throw new Error("hub link not found");
  const page2 = abs(link, base);
  const r2 = await fetch(page2, { headers: UA, signal: AbortSignal.timeout(15000) });
  const html = await r2.text();
  const file = strip(/<div[^>]*class="[^"]*card-header[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] || "");
  const size = strip(/<i[^>]*id="size"[^>]*>([\s\S]*?)<\/i>/i.exec(html)?.[1] || "");
  /* h2 a.btn buttons (either attr order) */
  const btns: { href: string; text: string }[] = [];
  for (const h of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) {
    for (const a of h[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (!/class\s*=\s*"[^"]*btn/i.test(a[1])) continue;
      const href = /href\s*=\s*"([^"]+)"/i.exec(a[1])?.[1] || "";
      if (href) btns.push({ href, text: strip(a[2]) });
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
  const fresh = await latestBase("gdflix");
  const oldBase = baseOf(entry);
  const url = oldBase && fresh !== oldBase ? entry.replace(oldBase, fresh) : entry;
  const base = baseOf(url);
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  const html = await r.text();
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
  const cands: Cand[] = [];
  const direct = (re: RegExp, server: string) => {
    const b = btns.find((x) => re.test(x.text));
    if (b) cands.push({ url: abs(b.href, base), server });
  };
  direct(/FSL V2/i, "FSL V2");
  direct(/DIRECT (DL|SERVER)/i, "Direct");
  direct(/CLOUD DOWNLOAD \[R2\]/i, "Cloud R2");
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
  /* FAST CLOUD: card-body a */
  const fc = btns.find((x) => /FAST CLOUD/i.test(x.text));
  if (fc) {
    try {
      const fr = await fetch(abs(fc.href, base), { headers: UA, signal: AbortSignal.timeout(10000) });
      const fh = await fr.text();
      const card = /<div[^>]*class="[^"]*card-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(fh)?.[1] || "";
      const href = /<a\b[^>]*href="([^"]+)"/i.exec(card)?.[1] || "";
      if (href) cands.push({ url: abs(href, base), server: "Fast Cloud" });
    } catch {
      /* skip */
    }
  }
  /* Instant DL: newer GDFlix pages link the CDN file directly (and older
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
    const { cands, file, size } = /(gdflix|gdlink)/i.test(host)
      ? await gdflixResolve(entry)
      : await hubResolve(entry);
    if (!cands.length) {
      return NextResponse.json({ ok: true, kind: "page", url: entry });
    }
    let firstUnknown: Cand | null = null;
    for (const c of cands) {
      const verdict = await probe(c.url);
      if (verdict === "alive") {
        return NextResponse.json({
          ok: true, kind: "file", url: c.url, server: c.server,
          filename: file, size, stale: false,
        });
      }
      if (verdict === "unknown" && !firstUnknown) firstUnknown = c;
    }
    if (firstUnknown) {
      const c = firstUnknown;
      return NextResponse.json({
        ok: true, kind: "file", url: c.url, server: c.server,
        filename: file, size, stale: false,
      });
    }
    const c = cands[0];
    return NextResponse.json({
      ok: true, kind: "file", url: c.url, server: c.server,
      filename: file, size, stale: true,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "resolve failed" },
      { status: 502 }
    );
  }
}
