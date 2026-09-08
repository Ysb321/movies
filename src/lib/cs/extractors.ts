/* Host-page extractors, ported from the CloudStream (cs3) provider
 * sources: VCloud/HubCloud card pages (vegamovies / moviesdrive /
 * hdhub4u family) and GDFlix / DriveSeed / Driveleech file pages
 * (moviesmod / moviesdrive family). Everything returned here is a
 * DIRECT downloadable / streamable URL - exactly what VLC needs. */
import { rawGet, rawGetResilient, headFinalUrl, buzzRedirect, absolutize, Budget, csxUrls } from "./http";
import * as cheerio from "cheerio";

export type HostChip = {
  server: string; // "V-Cloud [FSL Server]"
  link: string; // DIRECT url
  quality: string; // "1080p"
  size: string; // "2.6GB"
};

const qualityOf = (s: string): string => {
  const m = String(s).match(/(\d{3,4})\s*p/i);
  if (m) return `${m[1]}p`;
  if (/8k/i.test(s)) return "4320p";
  if (/4k|2160/i.test(s)) return "2160p";
  if (/720/i.test(s)) return "720p";
  if (/480/i.test(s)) return "480p";
  return "";
};

const atob2 = (s: string): string => {
  try {
    return Buffer.from(Buffer.from(s, "base64").toString("utf8"), "base64").toString("utf8");
  } catch {
    return "";
  }
};

const isVcloudFamily = (u: string) => /vcloud|hubcloud|zcloud/i.test(u);
export const isKnownHost = (u: string) =>
  /vcloud|hubcloud|zcloud|gdflix|gdlink|driveseed|driveleech/i.test(u);

/* VCloud / HubCloud card flow:
 * 1. host page -> var url = atob(atob('..')) (vcloud) | var url = '...' | div.vd > center > a
 * 2. card page (div.card-header = quality, i#size = size) -> h2 a.btn:
 *    FSL / FSLv2 / Mega / Download File / BuzzServer / PixelDrain /
 *    "Server : 10Gbps" (shortener chain) - all direct links */
/* the CSX extractors remap hubcloud/vcloud links to the CURRENT
 * domain from their urls.json (these hosts rotate constantly and the
 * old domains keep 403ing) */
async function remapDomain(url: string, budget: Budget): Promise<string> {
  try {
    const urls = await csxUrls(budget);
    const key = /hubcloud/i.test(url) ? "hubcloud" : /vcloud/i.test(url) ? "vcloud" : /zcloud/i.test(url) ? "zcloud" : null;
    if (key && urls[key]) {
      const latest = urls[key].replace(/\/$/, "");
      if (latest && !url.startsWith(latest)) return url.replace(new URL(url).origin, latest);
    }
  } catch {
    /* keep original */
  }
  return url;
}

export async function resolveCard(url: string, budget: Budget): Promise<HostChip[]> {
  const remapped = await remapDomain(url, budget);
  let html: string;
  try {
    html = await rawGetResilient(remapped, budget);
  } catch {
    html = await rawGetResilient(url, budget); /* old domain still alive? */
  }
  url = remapped;
  const base = new URL(url).origin;
  const $ = cheerio.load(html);

  let link = "";
  if (/\/video\//i.test(url)) {
    link = $("div.vd > center > a").attr("href") ?? "";
  } else {
    const script = $("script")
      .toArray()
      .map((el) => $(el).html() ?? "")
      .find((t) => /var\s+url\s*=/.test(t));
    if (script) {
      if (/vcloud/i.test(url)) {
        const m = script.match(/var\s+url\s*=\s*atob\s*\(\s*atob\s*\(\s*['"]([^'"]+)['"]/);
        if (m) link = atob2(m[1]);
      } else {
        const m = script.match(/var\s+url\s*=\s*['"]([^'"]*)['"]/);
        if (m) link = m[1];
      }
    }
  }
  if (!link) return [];
  if (!/^https?:/i.test(link)) link = absolutize(link, base);
  if (!/^https?:/i.test(link)) return [];

  const cardHtml = await rawGetResilient(link, budget);
  const c = cheerio.load(cardHtml);
  const header = c("div.card-header").text().trim();
  const size = c("i#size").text().trim();
  const quality = qualityOf(header) || qualityOf(link);

  const chips: HostChip[] = [];
  for (const el of c("h2 a.btn").toArray()) {
    const href = c(el).attr("href") ?? "";
    const text = c(el).text();
    if (!href) continue;
    const push = (u: string, server: string) => {
      if (u && /^https?:/i.test(u)) chips.push({ server, link: u, quality, size });
    };
    if (/FSL Server/i.test(text)) push(absolutize(href, link), "FSL");
    else if (/FSLv2/i.test(text)) push(absolutize(href, link), "FSL v2");
    else if (/Mega Server/i.test(text)) push(absolutize(href, link), "Mega");
    else if (/Download File/i.test(text)) push(absolutize(href, link), "Direct");
    else if (/BuzzServer/i.test(text)) {
      const d = await buzzRedirect(absolutize(href, link), budget);
      if (d) push(d, "Buzz");
    } else if (/pixeldra/i.test(href)) {
      const m = cardHtml.match(/var\s+pxl\s*=\s*["']([^"']+)["']/);
      if (m) {
        const pxl = m[1];
        const pbase = new URL(pxl).origin;
        const u = /download/i.test(pxl) ? pxl : `${pbase}/api/file/${pxl.split("/").pop()}?download`;
        push(u, "PixelDrain");
      }
    } else if (/Server\s*:\s*10Gbps/i.test(text)) {
      const final = await headFinalUrl(absolutize(href, link), budget);
      if (final) {
        const stripped = final.includes("link=") ? final.split("link=").pop()! : final;
        push(decodeURIComponent(stripped), "10Gbps");
      }
    }
    /* Gofile buttons need an API handshake - skipped (many other hosts) */
  }
  return chips;
}

/* GDFlix / DriveSeed / Driveleech file page:
 * ul li.list-group-item (Name/Size) + div.text-center a -> direct */
export async function resolveGdflix(url: string, budget: Budget): Promise<HostChip[]> {
  let pageUrl = url;
  /* driveseed/driveleech add ?type=d for the video file page */
  if (/driveseed|driveleech/i.test(url) && !/[?&]type=/.test(url)) pageUrl = `${url}${url.includes("?") ? "&" : "?"}type=d`;
  const html = await rawGetResilient(pageUrl, budget);
  const $ = cheerio.load(html);

  const nameItem = $("ul > li.list-group-item")
    .toArray()
    .map((el) => $(el).text())
    .find((t) => /name/i.test(t));
  const sizeItem = $("ul > li.list-group-item")
    .toArray()
    .map((el) => $(el).text())
    .find((t) => /size/i.test(t));
  const size = (sizeItem ?? "").replace(/.*?:\s*/, "").trim();
  const name = (nameItem ?? "").replace(/.*?:\s*/, "").trim();

  const chips: HostChip[] = [];
  for (const el of $("div.text-center a, a.btn-success, a.btn").toArray()) {
    const a = $(el);
    const href = a.attr("href") ?? "";
    const text = a.text().trim();
    if (!href || !/^https?:/i.test(href)) continue;
    /* skip nav/anchor junk, keep file links */
    if (/\.(css|js|png|jpe?g|svg|ico|webp)(\?|$)/i.test(href)) continue;
    const server =
      /pixel/i.test(text) || /pixeldrain/i.test(href) ? "PixelDrain" :
      /instant|direct|download/i.test(text) ? "Direct" :
      /drive/i.test(text) ? "GDrive" : text.slice(0, 14) || "GDFlix";
    chips.push({ server, link: href, quality: qualityOf(name + " " + text), size });
    if (chips.length >= 6) break;
  }
  return chips;
}

export async function resolveHostLink(url: string, budget: Budget): Promise<HostChip[]> {
  /* errors propagate - the engine records them in debug output */
  if (isVcloudFamily(url)) return await resolveCard(url, budget);
  if (/gdflix|gdlink|driveseed|driveleech/i.test(url)) return await resolveGdflix(url, budget);
  return [];
}
