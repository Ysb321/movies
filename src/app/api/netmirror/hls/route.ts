import { NextRequest, NextResponse } from "next/server";

/* HLS proxy for the native playlist lane (Server 23). net52-style signed
 * playlists (*.m3u8?in=<token::expiry::hash>) can't be trusted direct
 * from browsers: hotlink Referer checks, missing CORS for hls.js XHR,
 * and session cookies. This pins the Referer + a verify-trick session
 * the CDN expects, rewrites segment/key/nested-playlist URLs inside
 * playlists back through itself, pipes segments with CORS *, no-store
 * (tokens are short-lived). Host allowlist: our lanes only. */

export const runtime = "edge";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const ALLOWED = /^net\d+\.cc$/i;
const extraHost = (h: string) => h === "subscdn.top" || h.endsWith(".subscdn.top");
const HOME = "https://net77.cc/home";

/* verify-trick session, cached per isolate (~15h ticket life) */
let jar = "";
let jarExp = 0;
async function session(): Promise<string> {
  if (jar && Date.now() < jarExp) return jar;
  try {
    const res = await fetch("https://net52.cc/verify.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://net77.cc",
        Referer: "https://net77.cc/verify2",
        "User-Agent": UA,
      },
      body: `g-recaptcha-response=${encodeURIComponent(crypto.randomUUID())}`,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
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
      if (m && m[1]) {
        jar = `t_hash_t=${m[1]}; hd=on; ott=nf`;
        jarExp = Date.now() + 14 * 3600 * 1000;
        return jar;
      }
    }
  } catch {
    /* fall through jar-less; signed urls may not need it */
  }
  return "";
}

const proxied = (abs: string) =>
  `/api/netmirror/hls?u=${encodeURIComponent(abs)}`;

function rewrite(list: string, base: string): string {
  return list
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        /* EXT-X-KEY / MAP / MEDIA URIs */
        return line.replace(/URI="([^"]+)"/g, (_m, u: string) => {
          try {
            return `URI="${proxied(new URL(u, base).toString())}"`;
          } catch {
            return _m;
          }
        });
      }
      try {
        return proxied(new URL(t, base).toString());
      } catch {
        return line;
      }
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (
    target.protocol !== "https:" ||
    (!ALLOWED.test(target.hostname) && !extraHost(target.hostname.toLowerCase()))
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "*/*",
    Referer: target.hostname.includes("net27")
      ? "https://videodownloader.site/"
      : HOME,
    Origin: "https://net77.cc",
  };
  const ck = await session();
  if (ck) headers.Cookie = ck;
  const range = req.headers.get("range");
  if (range) headers.Range = range;
  let up: Response;
  try {
    up = await fetch(target.toString(), {
      headers,
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
  if (!up.ok && up.status !== 206) {
    return NextResponse.json(
      { error: `upstream ${up.status}` },
      { status: 502 }
    );
  }
  const ct = up.headers.get("content-type") || "";
  const isList =
    /mpegurl|m3u8/i.test(ct) || /\.m3u8(\?|$)/i.test(target.pathname);
  if (isList) {
    const text = await up.text();
    return new NextResponse(rewrite(text, target.toString()), {
      status: 200,
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
  }
  const out: Record<string, string> = {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  };
  const pass = (h: string) => {
    const v = up.headers.get(h);
    if (v) out[h.toLowerCase()] = v;
  };
  ["content-type", "content-length", "content-range", "accept-ranges"].forEach(
    pass
  );
  return new NextResponse(up.body, { status: up.status, headers: out });
}
