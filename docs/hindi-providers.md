# Hindi-audio providers: recon map (2026-09-09)

Goal: Hindi-audio streaming at NetMirror quality, from any source
(git repos, libraries, plugins, reddit). Shipped: **Castle (Server
12)** + **MoviesMod (Server 13)** + **AutoPlay (Server 14)**. This doc is the full map for future
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
  Multi Audio WEB-DL + BluRay, 480p-2160p, movies + series + Hindi
  Series / K-Drama / Anime.
- Chain: `?s=` search -> Dice-similarity + year match (Hindi-ish
  posts preferred) -> post h4/h3 links -> modrefer.in (base64) /
  modpro.blog -> driveleech/driveseed direct or unblocked* SID
  verify -> file page (Size/Name) -> Cloud/Instant/Worker/Direct/
  Resume final CDN (302 ?url= unwrap, worker token POST, ?type=1+2,
  video-seed.pro GDrive unwrap) -> HEAD validation.
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

## Live sources for future ports (ranked)

1. **Hindmovie SkyStream repo** (likhithkrishna1103-tech/Hindmovie,
   active Sep 2026): `domians.json` = current Hindi-DDL domains
   (vegamovies.catering, hdmovie2a.cfd, hindmovie.fit,
   new5.movies4u.clinic, uhdmovies.autos, luxmovies1.shop,
   123movies9.run, moviesleech.bar, ...) + portable client-side
   plugins: `movies4u/plugin.js` (107KB), `hindmoviez` (62KB),
   `hdmovie2` (65KB), `movierulz` (24KB), `vegamovies`,
   `zinkmovies`, `tamilblasters`, `cinefreak`, giant `cinestream`
   (339KB, multi-source?). Next DesiDDL blogs should come from here.
2. **CSX / Megix** (SaurabhKaperwan/CSX): Bollyflix, Moviesmod,
   World4uFree, CineStream (Kotlin; DesiDDL already ports its
   VegaMovies/MoviesDrive pattern). r/Cloudstream3 confirms CSX +
   phisher HindiProviders (Streamplay, Multimovies, HDMovie2,
   UpMovies, Einthusan HDRips) as the working Hindi set.
3. **TMDB-Embed-API providers** (self-host, Docker; some portable):
   Showbox/FebBox (needs febboxCookies + TMDB key - self-host only),
   4KHDHub (already via WebStreamr), OneTouchTV (api3.devcorp.me),
   ZXCStreams (r1.zxcstream.xyz), StreamFlix (api.streamflix.app +
   Firebase RTDB), DahmerMovies (a.111477.xyz), VaPlayer
   (streamdata.vaplayer.ru/api.php). Its `netmirror.js` uses
   net27.cc + videodownloader.site Referer - independent
   corroboration of our Server 10 approach.
4. **walterwhite-69/Moviebox-API** (FastAPI + CF bypass, active):
   MovieBox.ph MP4/HLS with Hindi dubs - self-host only.
5. **cinepro-org/core** (145 stars): multi-site scraper, 50+
   sources/title, docs.cinepro.cc - evaluate as a self-hosted
   aggregator.
6. **animedubhindi** (Hindmovie plugin, 53KB): Hindi-dubbed ANIME -
   the future "Anime 2" pill (our megaplay is sub-only).
7. **AllMovieLand successors** (allmovieland.info/.cc/.click):
   the hindi-dub-api upstream family (AwsIndStream player); needs
   fresh handshake RE if pursued.
8. **Torrent + debrid** (highest quality, needs RD/Premiumize keys):
   Torrentio + Hindi-dubbed WEB-DL (PSA/YTS) - the long-term 4K
   Hindi path, tracked for a future keyed lane.

## Dead / rejected (do not pursue)

- Videasy (videasy.to): **shutting down 2026-09-15** ("whole
  infrastructure switched off"). NB: BingeR's backend list includes
  Videasy - that leg dies; its FilmU/Cinezo/Vidbolt/Vidrift legs
  survive. Its Hindi "Fade" server dies with it.
- embed.su / vidsrc.su: apex + www both parked (findakey.net) - gone.
- HDGharTV (hdghartv.cc): "This service has been discontinued."
- hindi-dub-api + 8StreamApi (Vercel): deployments answer but the
  AllMovieLand scraper is broken ("Something went wrong", "Media not
  found"); archived/unmaintained. Pattern only.
- VixSrc (vixsrc.to): docs-fresh embed API with `?lang=` audio-track
  param, BUT `lang=hi` and `lang=en` both return "Invalid language"
  (Italian-first catalog, StreamingUnity family) - no Hindi value.
- Reddit dual-audio thread (r/PiracyArchive): streamxtv.tech
  suggested, reporter says "not giving hindi dubbed" - no action.
- Simatwa/moviebox-api: repo 404 + PyPI old versions deleted, 0.6.0
  is a 1.7kB stub - scrubbed, do not pursue.
- walterwhite-69/Moviebox-API: archived by author (MovieBox went
  paid, 480p max on API) - dead.
- MovieBox app API (api.inmoviebox.com/wefeed-mobile-bff): needs a
  secret HMAC PRIMARY_KEY (APK extraction) - blocked unless the key
  surfaces publicly.
- MP4Hydra (mp4hydra.org): "Back soon... rebuilding" since Jul 2026
  - down, re-check later.
- yahyaMomin/vegamovies-API: abandoned, author couldn't beat
  Cloudflare from Vercel/Render (works locally only).
- VidLink (vidlink.pro, TMDB-Embed `vidlink.js`): English-only
  (`multiLang=0`) + enc-dec.app dependency - no Hindi value.
- TMDB-Embed non-castle/4khdhub providers (onetouchtv, streamflix,
  vaplayer, zxcstreams, dahmermovies): English-only, no Hindi
  support found.

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
- moviesmod.army currently serves a cPanel parked page (dead/moved);
  always re-verify blog domains before porting (Megix Utils
  urls.json refreshes ours every 4h; Hindmovie domians.json is the
  cross-check).

## Removed: UltraStream (ex-Server 14, 2026-09-09)

- newhdmovie2 player-embed lane, removed per user request before it
  ever played (post HTML carries no data-source-embed - players are
  JS/AJAX-loaded; the triage markers never got a deployed read).
  Port notes (provider-hdmovie2, hdm2.biz host) deleted with the code.

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
- Genuine JW Player needs a paid library ID (user has none) - the
  same feature set built license-free; engine swappable later.
