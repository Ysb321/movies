import { NextRequest, NextResponse } from "next/server";

/* GDMirror resolver — multimovies.beer's "Recommended" player embeds live at
 * pro.iqsmartgames.com/evid/{token}, one opaque token per title, served only
 * through their private Dooplay player AJAX. This route resolves
 * slug -> movie page -> post ID + option number -> AJAX -> embed URL.
 * Movies only for now (TV episode addressing differs on their side).
 * Every failure degrades to 4xx/5xx + {error} so the client falls back to
 * the other players. Resolved evid URLs are stable (only the downstream
 * svid tokens rotate per request), so responses cache aggressively. */

export const runtime = "edge";

const SITE = "https://multimovies.beer";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** tolerant option scan: which player-option number is the GDMirror one?
 *  Dooplay renders one option element per source carrying data-nume="N"
 *  (element type varies by version), with the source name inside it. For
 *  every "gdmirror" mention, take the nearest PRECEDING data-nume (and
 *  data-post when the body class didn't yield the post id). */
function findGdmirrorOption(html: string): { post: string; nume: string } | null {
  const pagePost = html.match(/postid-(\d+)/)?.[1];
  const re = /gdmirror/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const window = html.slice(Math.max(0, m.index - 3000), m.index);
    const numes = [...window.matchAll(/data-nume="(\d+)"/g)];
    const posts = [...window.matchAll(/data-post="(\d+)"/g)];
    const nume = numes.length ? numes[numes.length - 1][1] : undefined;
    const post = pagePost ?? (posts.length ? posts[posts.length - 1][1] : undefined);
    if (nume && post) return { post, nume };
  }
  return null;
}

/** the AJAX answers JSON ({embed_url}) or raw iframe HTML - handle both */
function extractSrc(payload: string): string | null {
  let html = payload;
  try {
    const j = JSON.parse(payload);
    const v = j?.embed_url ?? j?.data?.embed_url ?? j?.data ?? j?.url;
    if (typeof v === "string") html = v;
  } catch {
    /* raw HTML - use as-is */
  }
  const m =
    html.match(/<iframe[^>]+src="([^"]+)"/i) ??
    html.match(/src=\\?"([^"\\]+)\\?"/i) ??
    html.match(/https?:\/\/[^\s"'<>\\]+/);
  const url = m?.[1] ?? m?.[0];
  return url && /^https?:\/\//.test(url) ? url : null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const slug = q.get("slug") ?? "";
  const type = q.get("type") === "tv" ? "tv" : "movie";
  if (!/^[a-z0-9-]{2,120}$/.test(slug)) {
    return NextResponse.json({ error: "bad slug" }, { status: 400 });
  }
  const pageUrl = `${SITE}/${type === "tv" ? "tvshows" : "movies"}/${slug}/`;
  try {
    const page = await fetch(pageUrl, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (!page.ok) {
      return NextResponse.json({ error: "title not found" }, { status: 404 });
    }
    const opt = findGdmirrorOption(await page.text());
    if (!opt) {
      return NextResponse.json({ error: "no gdmirror option" }, { status: 404 });
    }

    /* their player AJAX: GET first (works when the handler reads
     * $_REQUEST), POST fallback (form-encoded, like their own JS) */
    const ajaxUrl = `${SITE}/wp-admin/admin-ajax.php`;
    const qs = new URLSearchParams({
      action: "doo_player_ajax",
      post: opt.post,
      nume: opt.nume,
      type,
    });
    let payload: string | null = null;
    const get = await fetch(`${ajaxUrl}?${qs}`, {
      headers: { "user-agent": UA, accept: "*/*", referer: pageUrl },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (get?.ok) {
      const t = await get.text();
      if (t && t !== "0" && t !== "-1") payload = t;
    }
    if (!payload) {
      const post = await fetch(ajaxUrl, {
        method: "POST",
        headers: {
          "user-agent": UA,
          "content-type": "application/x-www-form-urlencoded",
          accept: "*/*",
          referer: pageUrl,
        },
        body: qs.toString(),
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);
      if (post?.ok) {
        const t = await post.text();
        if (t && t !== "0" && t !== "-1") payload = t;
      }
    }
    if (!payload) {
      return NextResponse.json({ error: "player ajax failed" }, { status: 502 });
    }
    const url = extractSrc(payload);
    if (!url) {
      return NextResponse.json({ error: "no embed url" }, { status: 502 });
    }
    return NextResponse.json(
      { url },
      { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
    );
  } catch {
    return NextResponse.json({ error: "upstream unreachable" }, { status: 502 });
  }
}
