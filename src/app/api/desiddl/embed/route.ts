import { NextRequest, NextResponse } from "next/server";

/* Server 11 (DesiDDL) hub embed proxy - a browser-grade lite proxy. Design
 * follows prior art: testcafe-hammerhead (the core Rammerhead packages -
 * a URL-rewriting proxy + injected client script, so the page "does not
 * know it is under proxy") and Ultraviolet/TitaniumNetwork (service-worker
 * interception + bare server; too heavy here, but the technique list -
 * rewrite JS navigation sinks, wrap fetch/XHR, keep everything
 * same-origin - is what this route implements edge-side). Refs for
 * future work live in docs/hub-embed.md.
 *
 * Flow: row tap -> hub page proxied into a same-origin sandboxed iframe
 * (popups/downloads/top-nav blocked) -> the USER clicks the hub's own
 * Download / FSL / Generate buttons (a real browser sails through) ->
 * the file URL is captured and auto-plays in the site player.
 *
 * Capture points (belt and suspenders - every hub flow ends in one):
 *  server: entry/redirect/hx-redirect already a file -> file shell;
 *   hub page-chains walked to the button page (meta refresh, vcloud
 *   double-atob var url, hubcloud var url, /video/, /drive/).
 *  bootstrap (injected FIRST in <head>, runs before hub scripts):
 *   link clicks / submits / window.open / fresh file nodes (armed by
 *   user clicks); __yf_prox() pulls hub navigation back into the
 *   proxy and reports file URLs; fetch + XHR wrapped (hub API calls
 *   stay in-proxy, small responses sniffed for file URLs after a
 *   click - this is what cracks JS "Generate" buttons); atob watched
 *   for decoded redirect targets (yetflix-navigate re-points the
 *   frame, winning the race against the hub's own direct hop).
 *  server JS rewrite: location.href=/replace()/assign()/window.location=
 *   assignments wrapped in __yf_prox(...) so JS redirects stay in-proxy.
 *  parent poll (client): iframe location watched for file / ?link= hops.
 * External (non-hub) links are left absolute + target=_blank so site nav
 * and ads can never hijack the frame; hub CSP metas are stripped so the
 * bootstrap can't be blocked. If our fetch is walled, the client falls
 * back to the raw hub page + paste box.
 * SSRF guard: entry host must be a hub host; every hop stays https, off
 * localhost/private, and on a hub-ish host.
 */

export const runtime = "edge";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,*/*",
};
const HUB_HOST = /(hubcloud|vcloud|gdflix|gdlink|fastdl)/i;
const PRIV = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[)/i;
const CHALLENGE = /(challenge-platform|cf_chl_opt|Just a moment\.\.\.|Attention Required)/i;
const FILE_EXT = /\.(mp4|mkv|avi|mov|webm|flv|wmv|m3u8|mpd|ts|m4v)(\?|#|$)/i;
const MAX_HTML = 4000000;

const baseOf = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host}`;
  } catch {
    return "";
  }
};
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};
const okNext = (u: string, entryHost: string) => {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" || PRIV.test(x.hostname)) return false;
    return HUB_HOST.test(x.hostname) || x.hostname === entryHost;
  } catch {
    return false;
  }
};

/* a URL that IS a playable file (or wraps one in ?link=) */
function fileFromUrl(u: string): string {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return "";
    const link = x.searchParams.get("link");
    if (link && /^https:\/\//i.test(link)) return link;
    if (FILE_EXT.test(x.pathname + x.search)) return x.href;
    if (/googleusercontent\.com|busycdn\.xyz/i.test(x.hostname)) return x.href;
    if (/pixeldrain/i.test(x.hostname) && /\/api\/file\//i.test(x.pathname)) return x.href;
    return "";
  } catch {
    return "";
  }
}

/* runs FIRST inside the proxied hub page: keeps hub navigation in-proxy,
 * reports user-generated file URLs, sniffs hub API responses. */
const BOOTSTRAP = `(function(){if(window.__YF_BOOT)return;window.__YF_BOOT=1;
var PROXY="/api/desiddl/embed?url=";var armedUntil=0;
function abs(u){try{return new URL(u,document.baseURI).href}catch(e){return ""}}
function isHttp(u){return /^https?:\\/\\//i.test(u)}
function hubish(a){try{var x=new URL(a);if(x.host===location.host)return false;return /(hubcloud|vcloud|gdflix|gdlink|fastdl)/i.test(x.hostname)}catch(e){return false}}
function fileFromUrl(u){if(!u)return "";try{var x=new URL(u,document.baseURI);if(x.protocol!=="http:"&&x.protocol!=="https:")return "";var link=x.searchParams.get("link");if(link&&/^https?:\\/\\//i.test(link))return link;if(/\\.(mp4|mkv|avi|mov|webm|flv|wmv|m3u8|mpd|ts|m4v)(\\?|#|$)/i.test(x.pathname+x.search))return x.href;if(/googleusercontent\\.com|busycdn\\.xyz/i.test(x.hostname))return x.href;if(/pixeldrain/i.test(x.hostname)&&/\\/api\\/file\\//i.test(x.pathname))return x.href;return ""}catch(e){return ""}}
function send(f){try{parent.postMessage({type:"yetflix-file",url:f},"*")}catch(e){}}
function arm(){armedUntil=Date.now()+6000}
function armed(){return Date.now()<armedUntil}
function prox(u){var a=/^https?:\\/\\//i.test(u)?u:abs(u);if(!isHttp(a))return u;var f=fileFromUrl(a);if(f){send(f);return a}if(hubish(a))return PROXY+encodeURIComponent(a);return a}
window.__yf_prox=prox;
function scanText(t){if(!t||t.length>400000)return;try{var re=/https?:\\/\\/[^\\s"'<>\\\\]{8,600}/g,m;while((m=re.exec(t))){var f=fileFromUrl(m[0].replace(/[),.;:'"]+$/,""));if(f){send(f);return}}}catch(e){}}
function scanSend(){try{var els=document.querySelectorAll("a[href],video[src],video source[src]");for(var i=0;i<els.length;i++){var u=els[i].getAttribute("href")||els[i].getAttribute("src")||"";var f=fileFromUrl(abs(u));if(f){send(f);return true}}}catch(e){}return false}
document.addEventListener("click",function(ev){arm();try{var t=ev.target&&ev.target.closest?ev.target.closest("a[href]"):null;if(t){var f=fileFromUrl(abs(t.getAttribute("href")));if(f)send(f)}}catch(e){}},true);
document.addEventListener("submit",function(ev){arm();try{var f=fileFromUrl(ev.target&&ev.target.action?ev.target.action:"");if(f)send(f)}catch(e){}},true);
try{window.open=function(u){arm();var a=/^https?:\\/\\//i.test(u||"")?u||"":abs(u||"");var f=fileFromUrl(a);if(f){send(f);return null}if(a&&hubish(a)){window.location.href=PROXY+encodeURIComponent(a)}return null}}catch(e){}
try{if(window.fetch){var _fetch=window.fetch.bind(window);window.fetch=function(input,init){var reqInput=input;try{var raw=typeof input==="string"?input:(input&&input.url)||"";var a=abs(raw);if(isHttp(a)&&hubish(a)&&!fileFromUrl(a)){reqInput=typeof input==="string"?PROXY+encodeURIComponent(a):new Request(PROXY+encodeURIComponent(a),input)}}catch(e){reqInput=input}return _fetch(reqInput,init).then(function(res){if(armed()){try{var cl=res.clone();cl.text().then(function(t){scanText(t)}).catch(function(){})}catch(e){}}return res})}}}catch(e){}
try{var _xopen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{var a=abs(String(u||""));if(isHttp(a)&&hubish(a)&&!fileFromUrl(a)){arguments[1]=PROXY+encodeURIComponent(a)}}catch(e){}return _xopen.apply(this,arguments)};var _xsend=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(){try{this.addEventListener("load",function(){if(!armed())return;try{scanText(this.responseText||"")}catch(e){}})}catch(e){}return _xsend.apply(this,arguments)}}catch(e){}
try{var _atob=window.atob.bind(window);window.atob=function(s){var d=_atob(s);try{if(/^https?:\\/\\//i.test(d)||/^\\/(video|drive|download|file)\\//i.test(d)){var a=abs(d);if(hubish(a)&&!fileFromUrl(a)){try{parent.postMessage({type:"yetflix-navigate",url:PROXY+encodeURIComponent(a)},"*")}catch(e){}}else{var f=fileFromUrl(a);if(f)send(f)}}catch(e){}return d}}catch(e){}
try{var mo=new MutationObserver(function(){if(armed())scanSend()});mo.observe(document.documentElement,{childList:true,subtree:true})}catch(e){}
try{window.addEventListener("beforeunload",function(){try{parent.postMessage({type:"yetflix-embed-left"},"*")}catch(e){}})}catch(e){}
try{parent.postMessage({type:"yetflix-embed-ready"},"*")}catch(e){}})();`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const htmlRes = (html: string) =>
  new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
const shell = (msg: { type: string; url?: string; message?: string }) =>
  htmlRes(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yetflix hub</title></head><body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0a0a0a;color:#e5e5e5;font:14px system-ui,sans-serif"><p style="padding:0 24px;text-align:center">${msg.type === "yetflix-file" ? "Opening in the player…" : esc(msg.message || "Couldn't load the hub page.")}</p><script>try{parent.postMessage(${JSON.stringify(msg)},"*")}catch(e){}</script></body></html>`
  );

const proxied = (u: string) => `/api/desiddl/embed?url=${encodeURIComponent(u)}`;

/* hub-page links stay in the proxy; file + external links stay direct */
function rewriteAttrUrl(raw: string, pageUrl: string, entryHost: string): string | null {
  const v = raw.trim();
  if (!v || v.startsWith("#")) return null;
  if (/^(javascript|data|mailto|tel|blob):/i.test(v)) return null;
  let u = v;
  if (/^\/\//.test(v)) u = `https:${v}`;
  else if (!/^https?:\/\//i.test(v)) {
    try {
      u = new URL(v, pageUrl).href;
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(u)) return null;
  if (fileFromUrl(u)) return null;
  if (!okNext(u, entryHost)) return null;
  return proxied(u);
}

/* wrap JS navigation sinks in __yf_prox(...) (location.href=, replace(),
 * assign(), window/document.location=, bare location=, location["href"]=;
 * paren-safe simple shapes only - reads and exotic expressions untouched). */
function rewriteScripts(html: string): string {
  return html.replace(
    /(<script\b(?![^>]*\bsrc\s*=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_m, open, code, close) => {
      let c = String(code);
      c = c.replace(
        /((?:\b(?:window|top|parent|self|document)\s*\.\s*)?location\s*\.\s*href\s*=(?![=>]))\s*([^;<>]{1,200});/gi,
        (_a, pre, expr) => (/[{}]/.test(expr) ? _a : `${pre}__yf_prox(${expr});`)
      );
      c = c.replace(
        /((?:\b(?:window|top|parent|self|document)\s*\.\s*)?location\s*\.\s*href\s*=(?![=>]))\s*([^;<>]{1,200})\s*$/gi,
        (_a, pre, expr) => (/[{}]/.test(expr) ? _a : `${pre}__yf_prox(${expr})`)
      );
      c = c.replace(
        /(location\s*\.\s*(?:replace|assign)\s*\()\s*([^()]{1,200})\s*\)/gi,
        (_a, pre, expr) => `${pre}__yf_prox(${expr}))`
      );
      c = c.replace(
        /((?:\b(?:window|top|parent|self|document)\s*\.\s*)location\s*=(?![=>]))\s*([^;<>]{1,200});/gi,
        (_a, pre, expr) => (/[{}]/.test(expr) ? _a : `${pre}__yf_prox(${expr});`)
      );
      /* bare location = X (landing-page redirects); the lookbehind keeps
       * window.location (wrapped above), x.location props and locals like
       * myLocation out of the match. */
      c = c.replace(
        /(?<![.\w$])location\s*=(?![=>])\s*([^;<>]{1,200});/gi,
        (_a, expr) => (/[{}]/.test(expr) ? _a : `location=__yf_prox(${expr});`)
      );
      c = c.replace(
        /(?<![.\w$])location\s*=(?![=>])\s*([^;<>]{1,200})\s*$/gi,
        (_a, expr) => (/[{}]/.test(expr) ? _a : `location=__yf_prox(${expr})`)
      );
      /* computed location["href"] = X */
      c = c.replace(
        /location\s*\[\s*['"]href['"]\s*\]\s*=(?![=>])\s*([^;<>]{1,200});/gi,
        (_a, expr) => (/[{}]/.test(expr) ? _a : `location["href"]=__yf_prox(${expr});`)
      );
      return `${open}${c}${close}`;
    }
  );
}

function rewritePage(html: string, pageUrl: string, entryHost: string): string {
  let out = html.replace(/<base\b[^>]*>/gi, "");
  /* hub CSP would kill the bootstrap - strip it (our shell sends none) */
  out = out.replace(
    /<meta\b[^>]*http-equiv\s*=\s*["']?(?:content-security-policy|x-frame-options)["']?[^>]*>/gi,
    ""
  );
  out = out.replace(/<(a|form|iframe)\b([^>]*?)>/gi, (_m, tag, attrs) => {
    const fixed = (attrs as string)
      .replace(/(href|src|action)\s*=\s*"([^"]*)"/gi, (_a, k, v) => {
        const n = rewriteAttrUrl(v, pageUrl, entryHost);
        return n ? `${k}="${n}"` : _a;
      })
      .replace(/(href|src|action)\s*=\s*'([^']*)'/gi, (_a, k, v) => {
        const n = rewriteAttrUrl(v, pageUrl, entryHost);
        return n ? `${k}='${n}'` : _a;
      });
    /* external anchors: new tab, never hijack the frame */
    if (String(tag).toLowerCase() === "a") {
      const hv = /href\s*=\s*["']([^"']*)["']/i.exec(fixed)?.[1] || "";
      if (
        /^https?:\/\//i.test(hv) &&
        !hv.startsWith("/api/desiddl/embed") &&
        !fileFromUrl(hv) &&
        !/target\s*=/i.test(fixed)
      ) {
        return `<${tag}${fixed} target="_blank" rel="noreferrer noopener">`;
      }
    }
    return `<${tag}${fixed}>`;
  });
  out = out.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, (m) => {
    const cm = /content\s*=\s*["']?\s*\d+\s*;\s*url\s*=\s*([^"'>\s]+)/i.exec(m);
    if (!cm) return m;
    const n = rewriteAttrUrl(cm[1], pageUrl, entryHost);
    return n ? m.replace(cm[1], n) : m;
  });
  out = rewriteScripts(out);
  const head = `<base href="${baseOf(pageUrl)}/">\n<meta name="yetflix-embed" content="1">\n<script>${BOOTSTRAP}</script>`;
  if (/<head\b[^>]*>/i.test(out)) out = out.replace(/<head\b[^>]*>/i, (m) => `${m}\n${head}`);
  else out = head + out;
  return out;
}

/* single-hop continuations for hub page-chains (page 1 -> button page) */
function continuation(html: string, pageUrl: string): string {
  const metas = [
    /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']?\s*\d+\s*;\s*url\s*=\s*([^"'>\s]+)/i,
    /<meta\b[^>]*content\s*=\s*["']?\s*\d+\s*;\s*url\s*=\s*([^"'>\s]+)[^>]*http-equiv\s*=\s*["']?refresh/i,
  ];
  for (const re of metas) {
    const m = re.exec(html)?.[1] || "";
    if (m) {
      try {
        const u = new URL(m, pageUrl).href;
        if (/^https?:\/\//i.test(u)) return u;
      } catch {
        /* next */
      }
    }
  }
  let blob = "";
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) blob += `\n${m[1]}`;
  const v = /var\s+url\s*=\s*atob\s*\(\s*atob\s*\(\s*['"]([^'"]+)['"]/i.exec(blob)?.[1] || "";
  if (v) {
    try {
      const u = new URL(atob(atob(v)), pageUrl).href;
      if (/^https?:\/\//i.test(u)) return u;
    } catch {
      /* next */
    }
  }
  const h = /var url = '([^']*)'/.exec(blob)?.[1] || "";
  if (h && /^https?:\/\//i.test(h)) return h;
  const vd = /<div[^>]*class="[^"]*\bvd\b[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i.exec(html)?.[1] || "";
  if (vd) {
    try {
      return new URL(vd, pageUrl).href;
    } catch {
      /* next */
    }
  }
  const drive = /href="([^"]*\/drive\/[A-Za-z0-9_-]{6,}[^"]*)"/i.exec(html)?.[1] || "";
  if (drive) {
    try {
      return new URL(drive, pageUrl).href;
    } catch {
      /* fall through */
    }
  }
  return "";
}

/* does this page already carry file links (attrs or scripts)? */
function pageFile(html: string, pageUrl: string): boolean {
  for (const m of html.matchAll(/(?:href|src|action)\s*=\s*["']([^"']+)["']/gi)) {
    try {
      if (fileFromUrl(new URL(m[1], pageUrl).href)) return true;
    } catch {
      /* next */
    }
  }
  for (const s of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of s[1].matchAll(/['"](https?:\/\/[^'"]{8,400})['"]/g)) {
      if (fileFromUrl(m[1])) return true;
    }
  }
  return false;
}

async function run(entry: string, init?: RequestInit): Promise<Response> {
  const entryHost = hostOf(entry);
  const seen = new Set<string>();
  let cur = entry;
  let first = true;
  for (let hop = 0; hop < 4; hop++) {
    if (seen.has(cur)) break;
    seen.add(cur);
    let r: Response;
    try {
      r = await fetch(cur, {
        ...(first ? init : {}),
        headers: {
          ...UA,
          Referer: baseOf(cur),
          ...((first ? (init?.headers as Record<string, string> | undefined) : undefined) || {}),
        },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      return shell({ type: "yetflix-embed-error", message: "The hub didn't answer our server." });
    }
    first = false;
    const hx = r.headers.get("hx-redirect") || "";
    if (hx) {
      try {
        const nx = new URL(hx, cur).href;
        const f = fileFromUrl(nx);
        if (f) return shell({ type: "yetflix-file", url: f });
        if (okNext(nx, entryHost)) {
          cur = nx;
          continue;
        }
      } catch {
        /* fall through to error */
      }
      return shell({ type: "yetflix-embed-error", message: "The hub's next hop went nowhere usable." });
    }
    const final = r.url || cur;
    const f0 = fileFromUrl(final);
    if (f0) return shell({ type: "yetflix-file", url: f0 });
    /* dead hub links bounce off-site (blog homepages, landing pages) -
     * never render those: their JS escapes the frame and nothing can
     * generate there. Fail honest instead. */
    if (!okNext(final, entryHost)) {
      return shell({
        type: "yetflix-embed-error",
        message: "This hub link looks dead (the hub bounced it off-site). Try another row.",
      });
    }
    if (r.status === 403) {
      return shell({ type: "yetflix-embed-error", message: "The hub walled our server (403)." });
    }
    if (!r.ok) {
      return shell({ type: "yetflix-embed-error", message: `The hub answered ${r.status}.` });
    }
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const len = Number(r.headers.get("content-length") || 0);
    if (!ct.includes("text/html")) {
      if (ct.startsWith("video/") || ct.includes("octet-stream")) {
        return shell({ type: "yetflix-file", url: final });
      }
      if (len > MAX_HTML) {
        return shell({ type: "yetflix-embed-error", message: "Unexpected file from the hub." });
      }
      const buf = await r.arrayBuffer();
      return new Response(buf, {
        headers: {
          "content-type": r.headers.get("content-type") || "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    }
    if (len > MAX_HTML) {
      return shell({ type: "yetflix-embed-error", message: "The hub page is too big to embed." });
    }
    const html = await r.text();
    if (CHALLENGE.test(html)) {
      return shell({ type: "yetflix-embed-error", message: "The hub showed our server a bot-check." });
    }
    if (pageFile(html, final)) return htmlRes(rewritePage(html, final, entryHost));
    const nx = continuation(html, final);
    if (nx && okNext(nx, entryHost) && !seen.has(nx)) {
      cur = nx;
      continue;
    }
    return htmlRes(rewritePage(html, final, entryHost));
  }
  return shell({ type: "yetflix-embed-error", message: "Too many hub hops." });
}

function entryOf(req: NextRequest): string | null {
  const u = req.nextUrl.searchParams.get("url") || "";
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" || !HUB_HOST.test(x.hostname) || PRIV.test(x.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const e = entryOf(req);
  if (!e) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  return run(e);
}

export async function POST(req: NextRequest) {
  const e = entryOf(req);
  if (!e) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 1000000) return NextResponse.json({ ok: false, error: "body too big" }, { status: 413 });
  const body = await req.arrayBuffer();
  const ct = req.headers.get("content-type") || "application/x-www-form-urlencoded";
  return run(e, { method: "POST", body, headers: { "Content-Type": ct } });
}
