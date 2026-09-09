# Hindi-audio providers: recon map (2026-09-09)

Goal: Hindi-audio streaming at NetMirror quality, from any source
(git repos, libraries, plugins, reddit). Shipped: **Castle (Server 12)**.
This doc is the full map for future development.

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
