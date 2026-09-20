# Hindi-audio providers: recon map (2026-09-12)

Goal: Hindi-audio streaming at NetMirror quality, from any source
(git repos, libraries, plugins, reddit). Shipped: **Castle (Server
12)** + **MoviesMod (Server 13)** + **AutoPlay (Server 14)** + **Nuvio (Server 15)**. This doc is the full map for future
development.

## Already in the app (Hindi coverage before this round)

- VidBolt (pill 6): multi-audio incl. Hindi. VidOut (pill 7, default):
  multi-audio HI/TA/TE/KA/EN. Server 8: screenscape (Hindi default),
  Multiverse (Hindi default audio), GDMirror keyed file view (incl.
  Hindi-dubbed). Server 9 WebStreamr: India-first config
  (multi+hi+ta+te, 4KHDHub/HDHub4u/MovieBox). Server 10 NetMirror:
  Hindi subs (Hindi audio only where NewTV has it). Server 11 DesiDDL:
  dual-audio DDL (VegaMovies/MoviesDrive/HDMovie2).

## Shipped this round: Castle (Server 12)

- Upstream: CastleTV Android-app backend `api.hlowb.com`
  (channel `IndiaA`), found via the TMDB-Embed-API `castletv` provider
  (Inside4ndroid/TMDB-Embed-API, MIT, 141 stars, active Aug 2026).
- Flow: `GET /v0.1/system/getSecurityKey/1` (plain JSON) ->
  `GET /film-api/v1.1.0/movie/searchByKeyword` (AES) ->
  `GET /film-api/v1.9.9/movie?movieId=` (AES, episodes + per-language
  tracks) -> `POST /film-api/v2.0.1/movie/getVideo2`
  {movieId,episodeId,languageId,resolution 4/3/2/1} (AES) ->
  `{videos[]|videoUrl, subtitles[]}`. Crypto: AES-128-CBC,
  key = base64(securityKey) + "T!BgJB" [:16], IV = key (WebCrypto).
- Code: `src/lib/castle.ts` (pure client) +
  `src/app/api/castle/stream/[kind]/[id]/route.ts`, rendered by
  HindiSources (`endpoint`, `laneTitle`, `resumeSuffix=site-cs`,
  `hideSiteLink`, `loadLines`, `year` props).
- Verified 2026-09-09: security key `{"code":200,...}` live; search
  "Dangal" decrypted (id 5747736935414784, languages [OST,Hindi]);
  details prefix decrypted (`firstLanguage: "Hindi"`); the shipped
  decrypt/parse code tested against real ciphertext. getVideo2 is a
  verbatim port - NOT yet triaged live (our site is down, and the
  sandbox can't POST to the API): the route returns stage `diag` so
  the first live run debugs itself. Fix 2026-09-09 (Hindi played English):
videoUrl-only (videos[] served OST for Hindi requests), permissionDenied
skip, resolutions [3,2,1], shared encodes labeled with all languages
(Hindmovie + meowtv consensus). TV series use the same lane with
  a per-season details redirect + episode picker (ported defensively).

## Shipped this round: MoviesMod (Server 13)

- Upstream: MoviesMod WP DDL blog, official domain
  `moviesmod.zone` (verified alive 2026-09-09, fresh Sep 2026
  Hindi-dubbed posts; `.army` parked, `.build` dead, `.gd` is an
  unrelated English streaming clone). Dual Audio {Hindi-English} /
  Multi Audio {Hindi-English-...} WEB-DL + BluRay, 480p-2160p, movies +
  series, Hindi Series / K-Drama / Anime sections.
- Chain: `?s=` search -> Dice-similarity + year match (Hindi-ish
  posts preferred) -> post page
  (.thecontent h4 per quality / h3 Season episode buttons) ->
  modrefer.in (base64) | links/posts/episodes.modpro.blog ->
  driveseed/driveleech direct (fast path) | unblocked* SID verify
  (cloud.unblockedgames.world ?sid=, CSX bypass: #landing forms
  -> ?go= token + cookie -> meta refresh; legacy s_343 fallback) -> redirect -> window.location.replace file
  page -> Instant Download (?url= keys -> POST {origin}/api,
  x-token=host) | Resume Worker Bot (token + /download?id=) |
  Cloud Download | Direct (?type=1+2) | Resume Cloud -> workers / r2 /
  cdn.video-leech.pro CDN (video-seed.pro hop unwrapped to the
  video-downloads.googleusercontent.com file) -> HEAD validation.
- Code: `src/lib/moviesmod.ts` (edge-safe: native fetch + regex,
  manual cookie jar, driveseed-first, parallel + partial results,
  in-memory 4h cache) + route, rendered by HindiSources
  (`resumeSuffix=site-mm`). Structure from NuvioStreamsAddon
  `moviesmod` provider (Feb 2026, instance sunset); SID finish
  (`?go=` token + cookie, legacy s_343 fallback) + file-page
  finish re-ported from the maintained CSX `bypass`/Driveleech
  (SaurabhKaperwan/CSX) after the Sep 2026 move to
  `cloud.unblockedgames.world/?sid=`. Blog buttons decode base64
  `url=`; domains from TVVVV + CSX-Utils lists (+ zone/build).
- Every stage appends to `diag`; fatal stages throw `mm: <stage>`
  laneErrors. Fix 2026-09-09 ("intermediates dead" on The Runner
  2026): modpro pages had dropped driveseed/tech.* links for
  cloud-SID links (token is an encrypted blob - the verify dance
  is mandatory, no shortcut).
- Triage 2026-09-09 (Deadpool 293660, CF Pages): search/match/post
  + SID all live (`resolved: 2/5`) but `streams: 0` - final stage
  instrumented (mm3 diag: redirect hosts, filepage status/size,
  button map, method outcomes, HEAD codes) + instant unwrap fixed
  to HEAD-follow (redirect:manual hides Location on edge).
- Triage 2026-09-09 (The Runner 1386315, mm3): `resolved: 5/5`
  but all 10 driveseed.org redirect GETs throw before first byte
  (no fp:/fi: notes) - mm4 captures the error text + redirect url
  to distinguish datacenter-block vs timeout vs malformed url.
- Fix 2026-09-09 (mm4 `err:Too many subrequests...`): CF free
  allows 50 subrequests/invocation and the chain burned ~70 (10
  SIDs x ~4 + hops). mm5 fits: one link per quality + single
  fallback (CSX-style), 10bit/HEVC dropped when an x264 tier-mate
  exists, zone-first domain check (lists on failure only),
  path-style search (no 302 hop). Budget now ~35-40 cold.

## Shipped this round: AutoPlay (Server 14)

- Zero-tap WebStreamr lane (user call - no lists, no taps): search
  the addon (IMDb then TMDB id) -> rank rows (direct-file first,
  Hindi/dual bonus, 1080>720>480>2160, HEVC/mkv penalty) ->
  resolve + play best in SmartPlayer, auto-advancing on dead links
  and playback errors. In-player source panel = manual override.
- SmartPlayer (ArtPlayer + hls.js + dash.js): HLS/DASH/progressive,
  in-player Quality/Audio/Server/Subtitle/Source selectors
  (row-hop; HLS alternate-audio auto-prefers Hindi), VLC +
  Download + Report, resume (:site-auto), unmuted-autoplay with
  muted fallback + notice. Cross-family hops remount via key.

## Shipped this round: Nuvio (Server 15)

- Upstream: `phisher98/phisher-nuvio-providers` (Sept 2026) via
  nuvioplugin.com (the yoruix/tapframe repos are gutted to templates).
- XDMovies: `new.xdmovies.wtf/php/search_api.php?query=&fuzzy=true`
  (+ `top.` fallback, x-auth-token `7297...`) -> exact tmdb_id match
  -> page `div.download-item` / `div.episode-card` (SxxEyy) links ->
  HubCloud (FSL V2/FSL/S3/Download/10Gbps) / HubCDN (r= b64 HLS) /
  Pixeldrain (API info + direct) / StreamTape (videolink) / HubDrive
  / HbLinks / HubStream / vidmoly-family / HEAD-gated passthrough.
- HindMoviez: `hindmovie.fit/page/1/?s=` (.cafe redirects there) ->
  article/h2.entry-title match -> movies: maxbutton x2 -> Get Links
  -> a.btn; series: h3 Season -> ep list -> h3 Episode -> a.btn ->
  same full extractor. Lang tagged Hindi on hindi/dubbed/dual.
- Robustness deviations: gdflix/gofile skipped (upstream calls
  undefined fns and crashes), BuzzServer skipped (needs manual
  Location reads), unknown hosts HEAD-gated (upstream passes blind).
- Budget: ~35 cold (XD ~20 + HMZ ~12 + heads); diag tag `nv:`.

## Shipped this round: 2Embed (Server 22)

- Upstream: 2Embed API (`2embed.online`), verified live 2026-09-12
- Pattern: Embed-based Hindi-dubbed movies/series using IMDb/TMDB IDs
- Endpoint: `/embed/movie/{id}` for movies, `/embed/tv/{id}/{season}/{episode}` for series
- Quality: 1080p via responsive iframe player with auto-updating links
- Features: Fast streaming servers, fully responsive player, 100% free
- Code: `src/app/api/embed2/stream/[kind]/[id]/route.ts`
- Rendered by HindiSources with `resumeSuffix=site-e2` flag
- No configuration needed - uses external 2Embed infrastructure

## Shipped this round: Videm (Server 23)

- Upstream: Videm API (`videm.xyz`), verified live 2026-09-12
- Pattern: Embed-based Hindi-dubbed movies/series with source failover
- Endpoint: `/embed/movie/{id}` for movies, `/embed/tv/{id}/{season}/{episode}` for series
- Features: Automatic failover, quality & audio selection, subtitles,
  built for mobile, no API key required
- Code: `src/app/api/videm/stream/[kind]/[id]/route.ts`
- Rendered by HindiSources with `resumeSuffix=site-vm` flag
- No configuration needed - uses external Videm infrastructure

## Shipped this round: HDHub (Server 24)

- Upstream: HDHub Stremio addon (`hdhub.thevolecitor.qzz.io`)
- Pattern: Direct FSLv2, Pixeldrain, HubCloud downloads with Hindi/English/Multi-Audio streams
- Endpoints: `/stream/movie/{imdbId}` and `/stream/series/{imdbId}` via Stremio protocol
- Features: 2160p/1080p/720p/480p available with Hindi audio preferred (DDP 2.0 Hindi + English DDP 5.1)
- Stream types: FSLv2, Pixeldrain, HubCloud, 10Gbps direct downloads
- Code: `src/app/api/hdhub/stream/[kind]/[id]/route.ts` + `src/lib/player.ts` (Server 24 provider)
- Rendered by HindiSources with `resumeSuffix=site-hd` flag
- Hindi priority: Streams with "Hindi" in description sorted first, then by quality (descending)
- Uses IMDb IDs (tt1234567) via TMDB external_ids lookup; fallback to TMDB IDs (tmdb:123)

## Live sources for future ports (ranked)

1. **2Embed** (2embed.online): Free embed API, auto-updates links, 1080p quality, fully responsive. Already integrated as Server 22.
2. **Videm** (videm.xyz): Free embed API with source failover, subtitles, quality selection. No API key needed. Already integrated as Server 23.
3. **Vidsrc** (vid-src.top): Responsive embed API, Hindi-dubbed support, no API keys needed.
4. **MoviesNexus** (moviesnexus.fun): Raw stream links with multilingual audio (English, Japanese, Hindi, French, Spanish, Ukrainian)
5. **VidNest** (vidnest.fun): Anime streaming with Hindi dubbed versions via `/anime/[ANILIST_ID]/[EPISODE]/[SUB_OR_DUB]`

## Removed: Non-working servers (2026-09-12)

- **8Stream** (Server 20): Self-hosted API with 2-step resolution, backend deployments not working consistently.
- **Scarper** (Server 21): Multi-source scraper API requiring API key and self-hosting, not working in production.
- **P.R. Movies** (Server 22): Replaced with working 2Embed and Videm servers.

## Dead / rejected (do not pursue)

- Videasy (videasy.to): **shutting down 2026-09-15** ("whole infrastructure switched off").
- embed.su / vidsrc.su: apex + www both parked (findakey.net) - gone.
- HDGharTV (hdghartv.cc): "This service has been discontinued."
- AllMovieLand successors (allmovieland.info/.cc/.click): the hindi-dub-api upstream family (AwsIndStream player); needs fresh handshake RE if pursued.
- MovieBox app API (api.inmoviebox.com/wefeed-mobile-bff): needs a secret HMAC PRIMARY_KEY (APK extraction) - blocked unless the key surfaces publicly.
- yahyaMomin/vegamovies-API: abandoned, author couldn't beat Cloudflare from Vercel/Render (works locally only).

## Reference lists (re-check monthly, fast churn)

- LyeDevGit/free-streaming-apis (Aug 2026, curl-verified): embed
  APIs (vidsrc.to/.io/.pm, vsembed.ru, vidsrc.in, vid-src.top,
  2embed.cc, superembed.stream, moviesapi.to/vidspark.to
  `/movie/{id}`, vidfast.vc, vidrock.ru, vidflix.club, vidlux.xyz,
  toustream.xyz, embed.wfs.lol, VidCore vidcore.org/.net) +
  self-hosted table + graveyard. NOTE: its ScreenScape/CinemaOS
  "embed gone" flags are stale - our Server 8 screenscape embed
  still works; verify, don't trust.
- FMHY non-English page (fmhy.net/non-english): per-language site
  lists (Hindi section exists; page is JS-heavy, read via browser).
- r/Cloudstream3 (Hindi Providers / Best working extension threads):
  CSX shortcode `csx`, phisher `phisherrepo`, Megix/CNCVerse recs.
