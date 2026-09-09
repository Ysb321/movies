# Server map: pill -> source

Pills render in `PROVIDERS` order (`Server N` = Nth visible pill).
Non-anime titles show 22 pills. Anime titles insert megaplay ("Anime 1")
at pill 12, shifting pills 12-22 down by one. Default server: VidOut
(pill 7, `useState("netout")`). Brand names never display - pills only.

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
| 12 | vidsrc | vidsrc.to/embed/... |
| 13 | vidlink | vidlink.pro/movie\|tv/... (keyless iframe) |
| 14 | vidcore | vidcore.org/embed/... (14 in-player servers) |
| 15 | vidfast | vidfast.vc/movie\|tv/... (4K + multi-audio rows) |
| 16 | twoembed | www.2embed.cc/embed/... |
| 17 | superembed | multiembed.mov/?video_id=&tmdb=1[&s=&e=] (CF check passes in browsers) |
| 18 | moviesapi | moviesapi.to/movie\|tv/... |
| 19 | vidspark | vidspark.to/movie\|tv/... (MoviesAPI codebase) |
| 20 | vidsrcin | vidsrc.in/embed/... (vsembed.ru backend) |
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
| 21 | netembed | HindiSources (nm ArtPlayer skin) -> SAME /api/netmirror/stream as Server 10 (?embed=1 deep-link -> new tab) |
| 22 | netnative | HindiSources (nm skin, :site-nmn) -> /api/netmirror/native (verify trick -> mobile search/post -> play.php h -> playlist.php HLS + subscdn subs; IP-gated 403 from Pages, friendly error); HLS via /api/netmirror/hls proxy |

Subs proxy (/api/netmirror/sub): net27 + subscdn.top (+subs) + MovieBox
CDN. Details per lane: docs/netmirror.md, docs/webstreamr.md,
docs/hub-embed.md.
