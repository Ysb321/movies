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
