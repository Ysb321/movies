# NetMirror — site embed + API lanes

Two independent integrations; both TMDB-keyed so content always matches.

## Server 22: NetMirror Embed (site player, iframe)

The `?embed=1` watch pages on netmirror.center, e.g.
`https://netmirror.center/tv/122350/?embed=1`.

- Movie: `/movie/{tmdb}/?embed=1` — verified 2026-09-09: `27205` resolves
  to "Mahanati [Telugu]" with "Watch & Download".
- TV: `/tv/{tmdb}/?embed=1` — verified: `122350` (India's Got Latent)
  renders season tabs (SE1/SE2) + episode buttons 1–7 + Watch & Download.
- `/tv/{id}/{s}/{e}` **404s** — no path-style deep link. S/E travel as
  best-effort `?s=&e=` params (their frontend may honor them; the
  in-embed picker covers selection either way).
- Full site page in the frame (PVRPlay-style), sandboxed + popup-free.
  Framing on the open web depends on their headers; the Electron app
  strips frame-block headers via `FRAME_HOSTS` (`desktop/index.js`).
  `PLAYER_HOSTS` carries `netmirror` for player time events.

## Server 10: NetMirror API lane (direct mp4s, no iframe)

`src/app/api/netmirror/stream/[kind]/[id]/route.ts` + `sub/route.ts`,
rendered by `HindiSources` into the site player / VLC.

- Netflix-direct: `GET {BASE}/api/embed-tmdb/{tmdb}` (movies) and
  `?type=tv&se={s}&ep={e}` (series) → `{ok, streams:[{url,resolution}],
  mp4, captions:[{url,lang,name}]}`. Verified live 2026-09-09 (Fight
  Club 550, RRR 579974, Breaking Bad 1396 S01E01: 360–1080p files).
- CDN links need `Referer: https://videodownloader.site/` or they 403
  (anti-hotlink vs default player UAs) — the route attaches it.
- NewTV fallback (Hotstar/Prime/Disney + Netflix-if-direct-empty):
  rotating-domain discovery (`checknewtv.php` → base64 api base) then
  `search.php → post.php → (episodes.php) → player.php`, with `Ott`
  headers per platform. Code-complete, soft-fails to `[]`.
- Caption URLs are rewritten to our `/api/netmirror/sub` proxy (CORS).
- Signed stream URLs live ~hours: no cache, no-store.

## Prior art / refs (for future developing)

- `Inside4ndroid/TMDB-Embed-API` — `providers/netmirror.js`
  (`getNetmirrorStreams`): net27.cc embed-tmdb + NewTV platform fan-out.
  Our API lane mirrors this provider (UA pool, `X-Requested-With:
  NetmirrorNewTV v1.0`, platform order).
- `Sushan64/NetMirror-Extension` issue #24 — the net27.cc REST migration
  writeup: unified TMDB system (no more per-OTT `ott=` params), the
  `Referer` CDN fix, deprecation of player.php/mobile + Cloudflare/OTP
  flows. The repo itself is a CloudStream-style Kotlin plugin
  (CNCVerse: Netflix/Disney/Hotstar/Prime providers).
- `nirmaleeswar30/Nivio` — working app built on the issue-#24 logic.
- Backends rotate across `netXX.cc` (net11/net27 observed working,
  net77 posted Jul 2026, older ones blocked) — trackers:
  netmirrorpc.com, netmiror.com. If `BASE` dies, check those.

## Framing block + same-origin proxy (2026-09-09)

Direct iframes to the `?embed=1` pages fail on the open web with
"refused to connect": the embed URL answers
`x-frame-options: SAMEORIGIN` (verified via a headers probe; Cloudflare
+ LiteSpeed, no CSP `frame-ancestors`). Chrome renders an XFO denial as
that exact error — the site is UP, framing is forbidden. Fix: Server 22
URLs run through the embed proxy as
`/api/desiddl/embed?allow=nm&url=<netmirror-embed-url>`:

- `allow=nm` profile: entry/hop guards = netmirror.center + netXX.cc
  (their API backends); the bootstrap rewrites hub hops into the proxy,
  files stay direct.
- `window.open`: hub mode reports files to the parent (auto-play) and
  swallows; site mode (`blank=true`) opens files/externals in a decoupled
  `_blank noopener` tab (nobody listens for capture events on the plain
  iframe path) so Watch & Download works.
- Frame runs `referrerPolicy="no-referrer"` (empty referers pass most
  hotlink guards; an unknown origin would not) + a popup-allowing
  sandbox (their trackers claim no popup ads).
- Electron keeps framing DIRECT (FRAME_HOSTS strips X-Frame-Options) —
  but that needs an app rebuild to take effect.

## Mirror status (2026-09-09)

Live web mirrors: net77.cc (Mirror 1), net27.cc (Mirror 2 — also our
Server 10 API base). Retired: net11/net22/net2025/pcmirror/iosmirror/
netmirror.cc. ISP blocks drive a 4–6-week rotation — trackers:
netmirrorpc.com, netmiror.com.
Probed and REJECTED as embed sources: netmirror.global (302 alias to
.center — same XFO), netmirror.gg (Apache 404), net77/net27.cc `/`
(verify-walled app at `/verify2`, no TMDB deep link — not wireable).
r/TeenIndia mentions Cineby + Sonion as alternates (untried).

## Tab crash -> Server 22 repurposed to API-direct (2026-09-09)

Live test: the proxied `?embed=1` page **hard-crashed the whole tab**
(freeze/Aw-Snap), while netmirror.center itself works fine directly
(user-captured DOM shows their ArtPlayer 5.4.0 playing a
`bcdnxw.hakunaymatata.com/resource/<md5>.mp4?sign=<md5>&t=<unix>`
stream at 00:19, 480p/1080p selector, subs/settings intact).
Probable mechanism: their load-time location canonicalizer sees the
proxy pathname (`/api/desiddl/embed?...`) instead of `/tv/...`, rewrites
`location.href` to "fix" it, our script wrap pulls the hop back into the
proxy, the check fails again -> infinite reload loop. (Their player is
ArtPlayer 5.4.0, not an iframe — nested-frame recursion is ruled out.)
Per the user's vote (working playback wins), Server 22 `netembed` no
longer frames anything: it is now `vlcOnly` rendering the same
`HindiSources` lane as Server 19 (API mp4s -> inline SitePlayer). The
`?embed=1` full site player stays one tap away via the "NetMirror ↗"
deep-link button in `HindiSources` (top-level tab, where XFO can't
bite). The `?allow=nm` proxy profile + `noReferrer` iframe flag are
retained in the route/types for future use, currently unused by any
provider. Bonus intel from the captured DOM: a sibling frontend
`bet.watch22.shop/play/watchbox.php` (signed `id/dp/sig/ts` params, NOT
TMDB-keyed -> not wireable) plays the same CDN streams fine from a
third-party origin — further evidence our-origin direct mp4 playback
should pass their CDN guard.

## Their ArtPlayer on Server 22 (2026-09-09)

Per the user's ask ("i want with their art player"), the `netembed`
lane renders NetMirror's own player config: `SitePlayer`
`variant="netmirror"` (Server 19 keeps the default Multiverse-style
skin). Matched from the user's captured DOM of their player
(ArtPlayer 5.4.0): `--art-theme: #b7daff`, volume 0.7, mini progress
bar, in-player `quality_new` selector (480P/1080P-style items from the
API streams) wired into the existing `onPickSource` hop flow (VLC /
Download / resume stay consistent; the label follows truth in the hop
effect, never optimistic, so failed hops can't desync it), no
pip/lock/screenshot extras, no source-panel button. Rate/aspect/flip +
subtitle toggle stay in the settings cog as on theirs. Not cloned:
their Play-on-TV + ratio-toggle customs, rewind/forward touch layers,
subtitle upload items (our lane ships real caption tracks instead).

## Cineverse-complete player (2026-09-09)

Per the user's ask, Server 22's player now mirrors the Cineverse
player's full feature set (`cineverse.modiplay.xyz/embed/{slug}`:
server list StreamHG/EarnVids/SeekStreaming/Player4Me/RPMShare/
UpnShare/StreamP2P + multi-audio + EN/HI/... subs + download), powered
by NetMirror streams. `SitePlayer variant="netmirror"` control row:
**servers** (distinct API platforms, keeps quality when possible),
**quality_new** (distinct qualities, keeps server when possible),
**subtitles** (OFF + every caption track via
`art.subtitle.switch(url, {type:'srt',...})`, verified against the
pinned artplayer@5.4.0 types at unpkg), VLC / download / report,
settings cog (rate/aspect/flip/sub-toggle). API findings that shaped
the code (types: `subtitle.switch(url, option?) => Promise`,
`subtitle.show` settable, `notice.show = msg`, custom-control
`selector`/`onSelect(selector, el, event) => void`): onSelect's return
is IGNORED, so all labels sync explicitly through
`syncSelectorLabels()` (truth-following; failed hops revert). Honest
exceptions to "exact": (1) true multi-audio track switching inside one
file is impossible in browsers (no API for embedded-mp4 audio tracks)
and our API ships no separate audio streams — different dubs arrive as
different rows, covered by server/quality switching when present; (2)
position resets on server/quality hops (different encodes, same as the
default variant); (3) no Play-on-TV / ratio-toggle customs (NetMirror's
own extras, not Cineverse's).

## Whole backend map (extension source, 2026-09-09)

Deep scrape for the "whole embed player" ask. Sources: `Sushan64/
NetMirror-Extension` (`NetflixMirrorProvider.kt` 19KB + `Utils.kt`,
CloudStream-style; Disney/HotStar/Prime providers mirror the NewTV
flow), `Inside4ndroid/TMDB-Embed-API` `providers/netmirror.js` (fully
mined), raw `net27.cc/api/embed-tmdb/550` probe, r/StremioAddons +
r/AndroidTVApps (no API intel; NET20.CC named as a 2025 mirror).
Nivio (Flutter app) skipped: no netmirror client in lib/providers, and
the extension already gives the full playback flow. CONCLUSION: the
`?embed=1` site is a thin frontend over these same backends — there is
no separate site API to wire. Their page itself stays unwireable (XFO
direct, reload-loop crash proxied).

Three-tier playback cascade (extension order):

1. **NewTV API** (primary): discover base via `mobiledetect{s,}.*` /
   `checknewtv.php` -> `token_hash`, then `newtv/player.php?id=` with
   `Ott` + `X-Requested-With: NetmirrorNewTV v1.0` -> `video_link`
   (**M3U8**!) + `referer`. Our Server 19 lane. NOTE the extension
   throttles this fan-out (1200ms gaps — bursts trip Too Many
   Requests): mirrored in our route.
2. **Native playlist flow**: `POST net77.cc/play.php` (form `id`, XHR +
   Origin/Referer net77, cookies) -> `{h}` token; `GET net52.cc/
   playlist.php?id=&t=&tm=&h=` -> `{sources:[{file,label,type}],
   tracks:[{kind,file,label,language}]}` (array-or-object!). Quality
   labels include Full/Mid/Low HD. Relative sub files resolve against
   **`subscdn.top`** (new subtitle CDN). Our Server 23 lane. The signed
   playlists look like `net52.cc/pv/hls/<id>.m3u8?in=<tok::expiry::
   hash>` (dead tokens answer a plain Apache 404, no CF wall); they
   ride `/api/netmirror/hls`, which pins Referer + a cached
   verify-trick session, rewrites segment/key/nested URLs back through
   itself, and answers CORS for hls.js/VLC.
3. **net27 embed-tmdb fallback**: exact shape we already consume, plus
   `noSource`/`error` ("still being added") — now surfaced.

Cookie/auth findings: mobile surface (`/mobile/search|post|
episodes.php`) rides `t_hash_t` (+`hd=on`, `ott=nf`). `t_hash_t` comes
from a TRIVIAL verify trick — `POST net52.cc/verify.php` with
`g-recaptcha-response=<random UUID>`, Referer `net77.cc/verify2`, no
redirects, harvest `t_hash_t` from Set-Cookie (~15h). No JS needed, so
it runs edge-side. The extension also opportunistically collects
`cf_clearance`/`user_token`/`t_hash_p` via page warmup (needs their
WebView; we don't) and its video interceptor pins Referer per link
(`videodownloader.site` for net27, `net77.cc/home` native) + Origin +
cookies on net52/net77/net22/net27 hosts. Our blind spots: we can't set
playback Referer from browsers, and if they start validating the
recaptcha or gating playlist.php on clearance, Server 23 empties
honestly (laneError) while 19/22 stand. Discovery list is now 24
domains (added the 9 `mobidetcts.*` variants from the extension).
net52 does NOT serve `/api/embed-tmdb` (Apache 404) — app/playlist host
only. Poster CDN observed: `imgcdn.kim/poster/v/$id.jpg` (Referer-gated).

## Ground truth: real playlist.php (2026-09-09, "Obsession")

Shape: top-level ARRAY `[{title, sources[], tracks[]}]`. Sources are
RELATIVE `/pv/hls/<id>.m3u8?...` (prefix net52), one entry per rung:
`Auto` (no `q` = multivariant, hls.js adapts), `Full HD` (`?q=1080p`),
`Mid HD` (`?q=720p`, carries `"default":"true"`), `Low HD` (`?q=480p`),
all `type: application/vnd.apple.mpegurl`. Keep backend order: Auto
first is the best default. Tracks: `{kind:"captions", file, label}` -
NO language code; files are protocol-relative `//pv.subscdn.top/subs/
<id>/<code>.srt` (note the `pv.` subdomain + `[CC]` naming); labels are
display text (`English  [CC]`, `हिन्दी`) - derive `lang` from the
filename code, label map as fallback, or the Hindi-first default sub
breaks. Dead `in=` tokens answer a plain Apache 404 (no CF wall).
