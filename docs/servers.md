# Server map: pill -> source

Pills render in `PROVIDERS` order (`Server N` = Nth visible pill).
13 pills on movies/TV. Anime titles add megaplay ("Anime 1") after pill
13. Default server: VidOut (pill 7, `useState("netout")`). Brand names
never display - pills only.

2026-09-09 prune: pills past 11 removed (free embeds 12-20 +
NetMirror Direct/Playlists 21-22). Their code stays in-tree
(HindiSources `playerVariant`/`endpoint` props, /api/netmirror/native,
/api/netmirror/hls, docs/netmirror.md) - re-append PROVIDERS entries
to restore a pill.

## Iframe servers (their player, framed)

| Pill | id | Upstream |
| --- | --- | --- |
| 1 | vidzee | player.vidzee.wtf/embed/movie/{tmdb}, /embed/tv/{tmdb}/{s}/{e} |
| 2 | cinesrc | cinesrc.st/embed/movie/{tmdb}, /embed/tv/{tmdb}?s=&e= (resume `?t=`) |
| 3 | peachify | peachify.top/embed/... (unsandboxed, `?startAt=` resume, autoNext) |
| 4 | bingr | bingr.one/watch/... (FilmU engine: FilmU/Videasy/Cinezo/Vidbolt/Vidrift; unsandboxed, fullscreen required) |
| 5 | pvrplay | pvrplay.online/watch/... (full site, noScroll) |
| 6 | vidbolt | vidbolt.xyz/movie\|tv/... (multi-audio incl. Hindi; postMessage resume; unsandboxed) |
| 7 | netout | vidout.pages.dev (VidOut bare player, DEFAULT; multi-audio HI/TA/TE/KA/EN, Skip Intro; unsandboxed + noScroll) |
| Anime 1 | megaplay | megaplay.buzz/stream/ani/{anilistId}/{ep}/sub (anime-only pill; AniList id via GraphQL title search; unsandboxed) |

Armor: default popup-killing sandbox; unsandboxed + popups-revoked for
peachify/bingr/vidbolt/netout/multimovies/megaplay (anti-sandbox
players). Resume via `?startParam` (cinesrc/peachify) + postMessage
time events (PLAYER_HOSTS allowlist in player.ts).

## Server 8: MultiMovies sub-players (their players, as-is, picker row)

Cineverse (movies-only, slug-keyed: cineverse.modiplay.xyz/embed/{slug}),
GDMirror (streams.iqsmartgames.com/embed + fixed site key = their
"Recommended" library file view), Nxsha (web.nxsha.app/embed),
screenscape (screenscape.me/embed?tmdb=&type=, Hindi default), Multiverse
(multiverse.modiplay.xyz/embed/{tmdb}|/embed/tv/..., TMDB-keyed),
Vidout (vidout.pages.dev). Never cineverse.pages.dev (unrelated demo)
or multiverse.pages.dev (dead 500) or /embed/{slug} on Multiverse
(static demo shell).

## API lanes (our player, no iframe - vlcOnly)

| Pill | id | Component -> route -> upstream |
| --- | --- | --- |
| 9 | webstreamr | VlcSources -> /api/webstreamr -> self-hosted WebStreamrMBG Stremio addon, India-first config (multi+hi+ta+te): 4KHDHub/HDHub4u/MovieBox/VidSrc/VidZee/VixSrc + HubCloud/GDFlix/... extractors; in-player audio changer; VLC handoff |
| 10 | netmirror | HindiSources -> /api/netmirror/stream -> net27.cc embed-tmdb (signed mp4 360-1080p + captions) + NewTV fan-out (mobiledetect* discovery -> player.php M3U8; 403-gated from Pages); :site-nm resume; Hindi subs default |
| 11 | desiddl | DdlSources -> /api/desiddl -> VegaMovies (new2.vegamovies.futbol) + MoviesDrive (new3.moviesdrive.christmas) + HDMovie2 (newhdmovie2.best -> hdm.im -> GDFlix); hub links (G-Direct/fastdl, V-Cloud, HubCloud, GDFlix) embedded, user generates -> auto-plays; :site-dd resume |
| 12 | castle | HindiSources -> /api/castle/stream -> CastleTV app backend (api.hlowb.com, IndiaA): AES search/details/getVideo2, Hindi track + 1 fallback, 1080p/720p/480p + subs; :site-cs resume; playback step un-triaged live (site down), diag-driven; in-player lang switch (position-preserving) |
| 13 | moviesmod | HindiSources -> /api/moviesmod/stream -> moviesmod.zone Dual/Multi Audio Hindi posts (480p-2160p, movies + series): search -> post -> modpro/modrefer -> cloud SID bypass (CSX ?go= flow) -> driveseed file page -> Instant/Worker/Direct/Resume finals; :site-mm resume; CF 50-subrequest budget build (mm5) |
| 14 | autoplay | AutoSources -> /api/webstreamr (addon search) -> zero-tap: ranked rows auto-resolve + play best in SmartPlayer (ArtPlayer + hls.js + dash.js: HLS/DASH/progressive, quality/audio/server/subtitle selectors, VLC + Download), auto-advance on dead links; :site-auto resume |
| 15 | nuvio | HindiSources -> /api/nuvio/stream -> XDMovies (search API + tmdb_id match -> HubCloud FSL/S3/10Gbps, HubCDN HLS, Pixeldrain, StreamTape) + HindMoviez (title search -> maxbutton/get-links/a.btn -> full extractor); movies + series; :site-nv resume |

Subs proxy (/api/netmirror/sub): net27 + subscdn.top (+subs) + MovieBox
CDN. Details per lane: docs/netmirror.md, docs/webstreamr.md,
docs/hub-embed.md.
