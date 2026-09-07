/* Multi Dub generator-page proxy (user-designed flow): serves the
 * HubCloud/dl.php "Generate Link" page SAME-ORIGIN inside our player.
 * The user clicks Generate in the embedded page; the injected watcher
 * script detects the generated direct link in the DOM and postMessages
 * it to the parent, which swaps the page for our video player.
 * All proxied targets are allow-listed (no open proxy). */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge"; // Cloudflare Pages

const ADDON = "https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club";

function allowed(u: string): boolean {
  return (
    u.startsWith(ADDON) ||
    u.startsWith("https://hubcloud") ||
    u.startsWith("https://gamerxyt") ||
    u.startsWith("https://drive.google") ||
    /^https:\/\/[a-z0-9-]*\.?googleusercontent\.com/i.test(u) ||
    /^https:\/\/[a-z0-9-]+---sn-/i.test(u)
  );
}

const MEDIA_RE = /googleusercontent|drive\.usercontent|\.mkv|\.mp4|\.webm|\.m3u8|videoplayback/i;

const WATCHER = `<script>(function(){
  function send(u){ try { parent.postMessage({ yetflixDubUrl: u }, "*"); } catch(e){} }
  function isMedia(u){ return /googleusercontent|drive\\.usercontent|\\.mkv|\\.mp4|\\.webm|\\.m3u8|videoplayback/i.test(u); }
  function abs(u){ try { return new URL(u, location.href).href; } catch(e){ return u; } }
  function prox(u){ return "/api/dub/page?u=" + encodeURIComponent(abs(u)); }
  var of = window.fetch;
  if (of) window.fetch = function(i, o){ try { var t = typeof i === "string" ? i : i.url; if (/^https?:/.test(abs(t))) i = prox(t); } catch(e){} return of.call(window, i, o); };
  var oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u){ try { if (/^https?:/.test(abs(u))) arguments[1] = prox(u); } catch(e){} return oo.apply(this, arguments); };
  document.addEventListener("click", function(e){
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var h = abs(a.getAttribute("href"));
    if (isMedia(h)) { e.preventDefault(); send(h); return; }
    if (/^https?:/.test(h)) { e.preventDefault(); location.href = prox(h); }
  }, true);
  document.addEventListener("submit", function(e){
    try {
      e.preventDefault();
      var f = e.target;
      var a = abs(f.getAttribute("action") || location.href);
      var q = new URLSearchParams(new FormData(f)).toString();
      location.href = prox(a + (a.indexOf("?") > -1 ? "&" : "?") + q);
    } catch(err){}
  }, true);
  function scan(){
    if (isMedia(location.href)) { send(location.href); return; }
    var as = document.getElementsByTagName("a");
    for (var i = 0; i < as.length; i++) {
      var h = abs(as[i].getAttribute("href"));
      if (isMedia(h)) { send(h); return; }
    }
  }
  setInterval(scan, 700); scan();
})();</script>`;

function proxied(u: string): string {
  return `/api/dub/page?u=${encodeURIComponent(u)}`;
}

function rewriteHtml(html: string, base: string): string {
  const fix = (v: string): string => {
    try {
      const a = new URL(v, base).href;
      if (/^https?:/i.test(a) && !MEDIA_RE.test(a)) return proxied(a);
    } catch {}
    return v;
  };
  html = html.replace(/(href|src|action)=["']([^"']+)["']/gi, (_m, attr, v) => `${attr}="${fix(v)}"`);
  html = html.replace(/content=["'](\d+\s*;\s*url=)([^"']+)["']/gi, (_m, p, v) => `content="${p}${fix(v)}"`);
  return html;
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u || !/^https?:\/\//i.test(u) || !allowed(u)) {
    return new NextResponse("Source not allowed", { status: 400 });
  }
  try {
    const r = await fetch(u, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,*/*",
      },
      cache: "no-store",
    });
    const ct = r.headers.get("content-type") ?? "";
    if (/^video\//i.test(ct) || /octet-stream|x-mpeg|matroska/i.test(ct)) {
      /* landed directly on the media file - auto-capture and play */
      return new NextResponse(
        `<!doctype html><html><body><p style="font-family:sans-serif">Link ready - starting player...</p>${WATCHER}<script>parent.postMessage({yetflixDubUrl:${JSON.stringify(r.url)}},"*")</script></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
      );
    }
    const html = await r.text();
    const out = rewriteHtml(html, r.url) + WATCHER;
    return new NextResponse(out, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (e: any) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:sans-serif;padding:20px"><h3>Couldn't load the generator page</h3><p>${e?.message ?? "network error"}</p><p>Pick another source chip in Yetflix.</p></body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
}
