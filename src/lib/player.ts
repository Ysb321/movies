/** Streaming embed providers (shown to users as generic "Server 1/2/..." —
 *  brand names are never displayed).
 *  - VidZee: player.vidzee.wtf/embed/movie/{tmdb} + /embed/tv/{tmdb}/{s}/{e}
 *    (both verified live). No URL params documented.
 *  - CineSrc: cinesrc.st/embed/movie/{tmdb} and query-style
 *    /embed/tv/{tmdb}?s={s}&e={e} (docs + both verified live). Supports
 *    ?t={seconds} start time (resume), autonext/auto-skip intros.
 *  - Peachify: peachify.top/embed/movie/{tmdb} + /embed/tv/{tmdb}/{s}/{e}
 *    (verified live). ?startAt= resume, autoNext, multi-source fallback.
 *    Anti-sandbox detection: MUST run unsandboxed; popups revoked via
 *    Permissions-Policy instead (denyPopups flag).
 *  - BingeR: bingr.one/watch/movie/{tmdb} + /watch/tv/{tmdb}/{s}/{e}
 *    (both verified live). Full site wrapping the FilmU multi-source
 *    engine (FilmU/Videasy/Cinezo/Vidbolt/Vidrift), subtitles, TV
 *    auto-next; noScroll crops their page chrome. Anti-sandbox ->
 *    unsandboxed + popups revoked. Fullscreen must stay ALLOWED: their
 *    player requests it during playback startup and breaks without it.
 *  - VidBolt: vidbolt.xyz/movie/{tmdb} + /tv/{tmdb}/{s}/{e} (verified;
 *    embed-only by design). Multi-AUDIO (Hindi/Tamil/English + more)
 *    switchable in-player; postMessage events feed resume tracking.
 *    FilmU-family -> unsandboxed + popups revoked, fullscreen allowed.
 *  - VidOut (id "netout"): vidout.pages.dev - Netout's BARE PLAYER (no
 *    profile gate, no site chrome): /watch/movie/{tmdb} + /tv/{tmdb}/S{s}/E{e}
 *    (both verified live). Multi-audio (Hindi/Tamil/Telugu/Kannada/English),
 *    Skip Intro, Episodes drawer; the site default player.
 *    Runs VidCore inside with in-player server options; one-time profile
 *    tap on first load; unsandboxed (flags cascade to VidCore) + popups
 *    revoked; noScroll crops their chrome.
 *  - MultiMovies (Server 8): the sources on multimovies.beer, embedded
 *    AS-IS (their player, not ours), in the site's own source order:
 *    Cineverse (cineverse.modiplay.xyz/embed/{slug} - slug-keyed,
 *    movies only; slugs mirror multimovies slugs and are derived
 *    from the TMDB title at runtime), GDMirror (their "Recommended"
 *    tag: streams.iqsmartgames.com/embed - the exact keyed player their
 *    page loads (key on movies + TV; keyed mode shows their library
 *    file view, e.g. the V4/V3 releases on Spider-Man), Nxsha
 *    (web.nxsha.app/embed - documented embed API, movies + TV),
 *    screenscape (screenscape.me/embed - documented embed API, movies
 *    + TV, Hindi audio by default), Multiverse
 *    (multiverse.modiplay.xyz/embed/{tmdb} + /embed/tv/{tmdb}/{s}/{e}
 *    - TMDB-keyed, movies + TV)
 *    and Vidout (vidout.pages.dev - movies + TV). NB: cineverse.
 *    pages.dev is an unrelated info-only demo and multiverse.pages.dev
 *    is dead (HTTP 500) - neither is the site's player, never use them.
 *  - MegaPlay: megaplay.buzz/stream/ani/{anilistId}/{ep}/{sub|dub} - the
 *    anime-only server ("Anime 1" pill); AniList id resolved from the TMDB
 *    title at watch time (src/lib/anilist.ts). Embed-only on their side;
 *    their player rejects the sandbox attr -> unsandboxed + popups
 *    revoked, same as the other anti-sandbox players.
 *  - PVRPlay: pvrplay.online/watch/movie/{tmdb} + /watch/tv/{tmdb}/{s}/{e}
 *    (both resolve live). Full streaming SITE rather than an embed API - no
 *    customization params, their page chrome shows inside the frame, and
 *    framing permission is not guaranteed (Electron strips any frame-block
 *    headers via FRAME_HOSTS; on the open web it depends on their headers).
 *  - NetMirror Embed (Server 22): netmirror.center/movie|tv/{tmdb}/?embed=1
 *    - their own site player (season/episode picker + Watch & Download
 *    inside); TMDB-keyed so content always matches. Full page in frame
 *    (PVRPlay-style); S/E deep-link params best-effort (path form 404s).
 *    The API lane (Server 10) stays separate - direct mp4s via net27.cc.
 *  - WebStreamr (Server 9, vlcOnly): the WebStreamrMBG Stremio addon -
 *    direct HTTP sources (4KHDHub/HDHub4u/MovieBox/VidSrc/VidZee/VixSrc
 *    sites, HubCloud/GDFlix/... extractors), resolved per title via our
 *    /api/webstreamr routes. Tap a source and it plays in the inbuilt
 *    site player (SitePlayer: ArtPlayer-based, Multiverse-style UI with
 *    Download + Open-in-VLC controls); VLC handoff per platform
 *    (desktop: bundled vlc.exe; Android: vlc intent; iOS: vlc-x-callback;
 *    PC web: desktop-app bridge + copy-link) covers whatever the browser
 *    can't decode (HEVC/Dolby). No iframe - the resolver generates every
 *    playable link itself (redirect-following, cookie sessions,
 *    generator-page scraping, sibling-index fallback, quota checks).
 *    Truly uncrackable pages open in a new tab. New/cam releases may
 *    have zero sources (empty state).
 *  - Servers 10-18 (free embed APIs, all TMDB-keyed, verified live
 *    2026-09-09): VidSrc (vidsrc.to), VidLink (vidlink.pro), VidCore
 *    (vidcore.org, 14 in-player servers), VidFast (vidfast.vc, 4K +
 *    multi-audio rows), 2Embed (2embed.cc, TMDB numerics on both
 *    routes), SuperEmbed (multiembed.mov, CF check passes in real
 *    browsers), MoviesAPI (moviesapi.to), VidSpark (vidspark.to) and
 *    VidSrc IN (vidsrc.in mirror). Default popup-killing sandbox.
 *  - NetMirror (Server 19, vlcOnly Hindi-OTT lane): Indian OTT rips via
 *    our /api/netmirror routes - direct signed mp4s (360-1080p) + caption
 *    tracks with Hindi subs auto-loaded, played in the inbuilt site player
 *    (HindiSources list, own :site-nm resume namespace). Netflix-direct is
 *    verified live; NewTV Hotstar/Prime/Disney fan-out best-effort.
 *  - DesiDDL (Server 11, no-iframe Hindi-DDL lane): VegaMovies +
 *    MoviesDrive + HDMovie2 (newhdmovie2.best -> hdm.im -> GDFlix) DDL
 *    posts via /api/desiddl - search, IMDb-hit verify, hub links opened
 *    embedded on tap (user generates the link, it auto-plays in the site
 *    player; DdlSources list, own :site-dd
 *    resume namespace). Ported from the Megix CSX CloudStream providers.
 *  To add another server later, append an entry to PROVIDERS — the watch
 *  page shows a server switcher automatically when there is more than one. */

/** a named player inside a multi-player server (Server 8 embeds the
 *  multimovies.beer players this way - their players, TMDB-keyed) */
export type EmbedSubPlayer = {
  id: string;
  name: string; /* chip label (e.g. "Cineverse") */
  /** movies-only player - hidden on TV titles */
  movieOnly?: boolean;
  /** slug-keyed player (Cineverse): the watch page passes a slugified
   *  TMDB title as the id instead of the TMDB id */
  slugTitle?: boolean;
  /** iframe armor overrides (undefined = inherit the provider's).
   *  sandbox: false forces unsandboxed, a string forces that sandbox
   *  token list (PLAYER_SANDBOX for the default no-popups sandbox). */
  sandbox?: false | string;
  denyPopups?: boolean;
  noScroll?: boolean;
  denyFullscreen?: boolean;
  movie: (id: string) => string;
  tv: (id: string, season: number, episode: number) => string;
};

export type EmbedProvider = {
  id: string;
  name: string;
  /** sub-players: when set, the watch page shows a player picker row
   *  and embeds the selected player instead of movie()/tv() */
  players?: EmbedSubPlayer[];
  /** prefer IMDb id (via TMDB external_ids) when available */
  prefersImdb?: boolean;
  /** query param name that sets the start time in seconds, if supported */
  startParam?: string;
  /** sandbox token list; overrides PLAYER_SANDBOX for this provider.
   *  false = no sandbox at all (last resort for anti-sandbox players). */
  sandbox?: false | string;
  /** render the iframe with scrolling="no" - for full-site providers whose
   *  inner page shows its own scrollbar and swallows wheel events (breaks
   *  scrolling of the host page). Inner page becomes unscrollable; wheel
   *  chains back to Yetflix. */
  noScroll?: boolean;
  /** add "popups 'none'" to the iframe Permissions-Policy - for unsandboxed
   *  providers (anti-sandbox players) so window.open dies without needing
   *  the sandbox attribute they reject. */
  denyPopups?: boolean;
  /** only show this provider on anime titles (watch page filters the pills) */
  animeOnly?: boolean;
  /** VLC server (WebStreamr): no iframe - the watch page renders the
   *  addon's source list and hands picked links to the installed VLC.
   *  movie()/tv() stubs below are never called. */
  vlcOnly?: boolean;
  /** pill label override (default "Server N") */
  label?: string;
  /** drop "fullscreen" from the iframe allow list - for players that
   *  auto-fullscreen the moment you press play; the Fullscreen API is
   *  denied to that frame entirely so playback stays inline. */
  denyFullscreen?: boolean;
  movie: (id: string) => string;
  tv: (id: string, season: number, episode: number) => string;
};

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** WordPress-style slug ("Spider-Man: Brand New Day" ->
 *  "spider-man-brand-new-day"). Cineverse embeds are slug-keyed and
 *  their slugs mirror multimovies slugs, so the watch page derives
 *  this from the TMDB title at runtime. */
export const slugify = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** default iframe armor: no popups, no modals, no top-navigation hijack.
 *  NB: omitting allow-popups is what REALLY kills popups (window.open
 *  returns null even on a user tap); the "popups 'none'" allow token is
 *  only a hint some engines honor. Unsandboxed providers rely on the
 *  browser's own popup blocker instead. */
export const PLAYER_SANDBOX =
  "allow-scripts allow-same-origin allow-downloads allow-forms allow-pointer-lock";

/** GDMirror site key: fixed site-wide (same key serves every title).
 *  BOTH movies + TV carry it: keyless/key-mismatched loads fall back to
 *  a generic third-party server lineup, while the keyed player shows
 *  their real library file view (verified 2026-09-08: Spider-Man 969681
 *  + Fight Club 550 serve their release files with the key). */
const GDMIRROR_KEY = "e11a7debaaa4f5d25b671706ffe4d2acb56efbd4";

export const PROVIDERS: EmbedProvider[] = [
  {
    id: "vidzee",
    name: "VidZee",
    movie: (id) => `https://player.vidzee.wtf/embed/movie/${id}`,
    tv: (id, s, e) => `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "cinesrc",
    name: "CineSrc",
    startParam: "t",
    movie: (id) => `https://cinesrc.st/embed/movie/${id}`,
    tv: (id, s, e) => `https://cinesrc.st/embed/tv/${id}${qs({ s, e })}`,
  },
  {
    id: "peachify",
    name: "Peachify",
    startParam: "startAt",
    /* unsandboxed + popups revoked: their player rejects any sandbox, so
     * popup ads are killed via Permissions-Policy instead */
    denyPopups: true,
    /* anti-sandbox detection: every sandbox token config was rejected -
     * this provider requires a fully unsandboxed iframe. Popup/top-nav
     * threats are handled OUTSIDE the iframe instead: Electron (EasyList
     * blocker + popup guard on every webContents); browsers use their own
     * popup blockers. */
    sandbox: false,
    movie: (id) => `https://peachify.top/embed/movie/${id}${qs({ color: "E50914" })}`,
    tv: (id, s, e) =>
      `https://peachify.top/embed/tv/${id}/${s}/${e}${qs({ color: "E50914", autoNext: "true" })}`,
  },
  {
    id: "bingr",
    name: "BingeR",
    /* verified live: bingr.one/watch/movie/{tmdb} + /watch/tv/{tmdb}/{s}/{e}.
     * Full site with an integrated multi-source player (FilmU engine;
     * FilmU/Videasy/Cinezo/Vidbolt/Vidrift backends), subtitles, TV
     * auto-next + built-in episode list. noScroll: their page has content
     * below the player - crop it like PVRPlay so the iframe never shows
     * its own scrollbar or swallows wheel events. */
    noScroll: true,
    /* their FilmU engine shows "Playback blocked" under ANY sandbox
     * (same anti-sandbox class as Peachify) - must run unsandboxed.
     * Popup ads are still killed: "popups 'none'" on the iframe
     * Permissions-Policy + in the exe the EasyList blocker and the
     * deny-all window.open guard on every frame. */
    denyPopups: true,
    /* NB: fullscreen MUST stay allowed - their FilmU engine requests it
     * as part of its playback startup; denying it (denyFullscreen test)
     * broke playback outright. The auto-fullscreen-on-play behavior is
     * inherent to this player. */
    sandbox: false,
    movie: (id) => `https://bingr.one/watch/movie/${id}`,
    tv: (id, s, e) => `https://bingr.one/watch/tv/${id}/${s}/${e}`,
  },
  {
    id: "pvrplay",
    name: "PVRPlay",
    /* full site: their page scrollbar + wheel capture breaks host scrolling */
    noScroll: true,
    movie: (id) => `https://pvrplay.online/watch/movie/${id}`,
    tv: (id, s, e) => `https://pvrplay.online/watch/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidbolt",
    name: "VidBolt",
    /* docs: vidbolt.xyz - /movie/{tmdb} + /tv/{tmdb}/{s}/{e} (both routes
     * verified; embed-only by design - direct-tab playback is refused on
     * their side, which is exactly our use). Multi-AUDIO player: Hindi,
     * Tamil, English and more switchable inside the player - perfect for
     * the India-first catalog. Documented postMessage events
     * (ready/play/pause/timeupdate/ended) feed the resume tracker.
     * Same player family as BingeR's FilmU engine (it was one of its
     * backends) -> ships unsandboxed + popups revoked, the config that
     * family needs; fullscreen allowed (their startup uses it). */
    denyPopups: true,
    sandbox: false,
    movie: (id) => `https://vidbolt.xyz/movie/${id}`,
    tv: (id, s, e) => `https://vidbolt.xyz/tv/${id}/${s}/${e}`,
  },
  {
    /* id kept as "netout" for saved-prefs stability; the player itself
     * is VIDOUT (vidout.pages.dev) - Netout's bare player deployment.
     * Verified live: NO profile gate, Netflix-style chrome, Skip Intro,
     * Episodes drawer, Speed & Quality - and MULTI-AUDIO (Hindi, Tamil,
     * Telugu, Kannada, English seen on GOT) - ideal India-first default.
     * Routes (verified): movie /watch/movie/{tmdb} (served direct);
     * series/anime /tv/{tmdb}/S{s}/E{e} (canonical - /watch/tv/{id}/{s}/{e}
     * redirects there). Unsandboxed (this player family rejects sandbox
     * flags) + popups revoked; noScroll crops the description section
     * below the player. */
    id: "netout",
    name: "VidOut",
    denyPopups: true,
    sandbox: false,
    noScroll: true,
    movie: (id) => `https://vidout.pages.dev/watch/movie/${id}`,
    tv: (id, s, e) => `https://vidout.pages.dev/tv/${id}/S${s}/E${e}`,
  },
  {
    /* Server 8 - the multimovies.beer sources, embedded as-is (their
     * player), in the site's own source order. Nxsha + screenscape +
     * Vidout + GDMirror + Multiverse are TMDB-keyed (verified live
     * 2026-09-08); only Cineverse is slug-keyed (/embed/{slug}, slugs
     * mirror multimovies slugs). Same iframe armor throughout
     * (unsandboxed + popups revoked + noScroll): sandboxing was tried
     * on GDMirror and reverted - their player refuses to play
     * sandboxed. Sub-player armor overrides still supported. */
    id: "multimovies",
    name: "MultiMovies",
    denyPopups: true,
    sandbox: false,
    noScroll: true,
    players: [
      {
        /* REAL Cineverse: cineverse.modiplay.xyz/embed/{slug} - their
         * backend (verified 2026-09-08: /embed/obsession and
         * /embed/spider-man-brand-new-day serve the full player: 7
         * in-player servers, multi-audio, EN/HI/... subs). The watch
         * page passes a slugified TMDB title (slugTitle). Movies only
         * - no TV addressing found on their side. NB: the old
         * cineverse.pages.dev URL was a wrong, unrelated info-only
         * demo - never use it. */
        id: "cineverse",
        name: "Cineverse",
        movieOnly: true,
        slugTitle: true,
        movie: (slug) => `https://cineverse.modiplay.xyz/embed/${slug}`,
        tv: () => "",
      },
      {
        /* GDMIRROR (their "Recommended" tag): the EXACT player their
         * page loads - streams.iqsmartgames.com/embed/movie/{tmdb}
         * + /embed/tv/{tmdb}/{s}/{e}, both with the fixed site key
         * (verified 2026-09-08: this is the Request URL their own
         * GDMirror option makes). Keyed mode shows their real library
         * file view (Spider-Man 969681: V4 HEVC + V3 x264 releases;
         * Fight Club 550; Breaking Bad S1:E1 incl. Hindi-dubbed). Keyless
         * loads only get a generic third-party lineup - never drop the
         * key. Their /evid/{per-title-token} iframe wraps this same
         * backend (rpmshare mirror servers). No frame block. */
        id: "gdmirror",
        name: "GDMirror",
        /* NB: runs UNSANDBOXED like its Server 8 siblings - their player
         * breaks under any sandbox, so the sandbox experiment was
         * reverted (their ad popups are the price on the open web: the
         * browser's popup blocker + COOP same-origin blunt them; the
         * desktop app denies them outright at the network level). */
        movie: (id) => `https://streams.iqsmartgames.com/embed/movie/${id}?key=${GDMIRROR_KEY}`,
        tv: (id, s, e) =>
          `https://streams.iqsmartgames.com/embed/tv/${id}/${s}/${e}?key=${GDMIRROR_KEY}`,
      },
      {
        /* https://web.nxsha.app/embed docs: /embed/movie/{tmdb} +
         * /embed/tv/{tmdb}/{s}/{e} (TMDb or IMDb ids); multi-server
         * fallback + multi-lang in-player. Verified: Fight Club (550)
         * + Game of Thrones S1:E1 (1399/1/1) resolve by title. */
        id: "nxsha",
        name: "Nxsha",
        movie: (id) => `https://web.nxsha.app/embed/movie/${id}`,
        tv: (id, s, e) => `https://web.nxsha.app/embed/tv/${id}/${s}/${e}`,
      },
      {
        /* https://screenscape.me/embed docs: /embed?tmdb={id}&type=movie
         * + &type=tv&s={s}&e={e}; Hindi audio by default. Verified:
         * Spider-Man: Brand New Day (969681) resolves by title. */
        id: "screenscape",
        name: "screenscape",
        movie: (id) => `https://screenscape.me/embed?tmdb=${id}&type=movie`,
        tv: (id, s, e) => `https://screenscape.me/embed?tmdb=${id}&type=tv&s=${s}&e=${e}`,
      },
      {
        /* REAL Multiverse: multiverse.modiplay.xyz/embed/{tmdb} +
         * /embed/tv/{tmdb}/{s}/{e} - TMDB-keyed, movies + TV (verified
         * 2026-09-08: /embed/969681 renders "Spider-Man: Brand New Day
         * (2026)", /embed/550 "Fight Club (1999)", /embed/tv/1396/1/1
         * "Breaking Bad - S01E01": ArtPlayer 5.1.7, Hindi default
         * audio, HubCloud/GDFlix/Backup servers). NB: /embed/{slug}
         * only serves a static demo shell (renders even for bogus
         * slugs - never use it), /embed/{id}/{s}/{e} without the /tv/
         * segment redirects to their cover page, and the old
         * multiverse.pages.dev URL was wrong/dead - never use it. */
        id: "multiverse",
        name: "Multiverse",
        movie: (id) => `https://multiverse.modiplay.xyz/embed/${id}`,
        tv: (id, s, e) => `https://multiverse.modiplay.xyz/embed/tv/${id}/${s}/${e}`,
      },
      {
        id: "vidout",
        name: "Vidout",
        movie: (id) => `https://vidout.pages.dev/watch/movie/${id}`,
        tv: (id, s, e) => `https://vidout.pages.dev/tv/${id}/S${s}/E${e}`,
      },
    ],
    /* stubs (a sub-player always resolves, and Start over preserves
     * the picked one - these are never embedded; Nxsha because it is
     * TMDB-keyed like the signature expects) */
    movie: (id) => `https://web.nxsha.app/embed/movie/${id}`,
    tv: (id, s, e) => `https://web.nxsha.app/embed/tv/${id}/${s}/${e}`,
  },
  {
    /* Server 9 - WebStreamr (vlcOnly, see the header doc): movie()/tv()
     * are never called - the watch page renders VlcSources instead. */
    id: "webstreamr",
    name: "WebStreamr",
    vlcOnly: true,
    movie: () => "",
    tv: () => "",
  },
  {
    /* Server 19 - NetMirror (vlcOnly Hindi-OTT lane, no iframe - the watch
     * page renders HindiSources instead; stubs never called). Indian OTT
     * rips (Netflix/Hotstar/Prime/Disney) via our /api/netmirror routes:
     * direct signed mp4s + caption tracks, Hindi subs auto-loaded.
     * Verified live 2026-09-09: Fight Club 550 + RRR 579974 + Breaking
     * Bad 1396 S01E01 all exact-match with 360-1080p files. NewTV
     * Hotstar/Prime/Disney fan-out is code-complete but unverified. */
    id: "netmirror",
    name: "NetMirror",
    vlcOnly: true,
    movie: () => "",
    tv: () => "",
  },
  {
    /* Server 11 - DesiDDL (no-iframe Hindi-DDL lane - the watch page
     * renders DdlSources instead; stubs never called). VegaMovies +
     * MoviesDrive dual-audio posts (the Hindi blogs Server 9 doesn't
     * scrape) via our /api/desiddl routes: Typesense search, IMDb-hit
     * verify, nexdrive intermediates -> G-Direct / V-Cloud / HubCloud
     * links opened embedded on tap (user generates, file auto-plays).
     * Full chain re-verified live 2026-09-09 (Fight Club 1999 posts,
     * Lanterns S01 post, nexdrive + vcloud + hubcloud + GDFlix). HDMovie2
     * (newhdmovie2.best -> hdm.im -> GDFlix) rides the same lane (blog
     * tag "HDMovie2"). */
    id: "desiddl",
    name: "DesiDDL",
    vlcOnly: true,
    movie: () => "",
    tv: () => "",
  },
  {
    id: "megaplay",
    name: "MegaPlay",
    /* anime-only server (pill label: "Anime 1", shown only on anime
     * titles - the watch page filters the pills). Full HiAnime-library
     * embed (megaplay.buzz/api). TMDB carries no AniList ids, so the
     * watch page resolves the title via AniList GraphQL search and builds
     * /stream/ani/{anilistId}/{ep}/sub itself - the stubs below are never
     * called. Direct navigation is disabled on their side: embed-only,
     * which is exactly our use. */
    animeOnly: true,
    label: "Anime 1",
    /* their player hard-rejects the sandbox attribute ("Opss! Sandboxed
     * our player is not allowed. Remove sandbox to use it.") ->
     * unsandboxed + popups revoked, same treatment as Peachify/BingeR. */
    denyPopups: true,
    sandbox: false,
    movie: () => "",
    tv: () => "",
  },
  {
    /* Servers 10-18 - free TMDB-keyed embed APIs (verified live
     * 2026-09-09: Fight Club 550 resolves with title on every movie
     * route below; TV routes verified on Breaking Bad 1396 S01E01).
     * All run under the default popup-killing sandbox until a player
     * proves it needs relaxing - report dead ones, they rotate
     * domains constantly. */
    id: "vidsrc",
    name: "VidSrc",
    /* the original embed API - plain player shell, no login/key. */
    movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidlink",
    name: "VidLink",
    /* multi-server player + subtitles; iframe embed is keyless (only
     * their JSON API needs a key). */
    movie: (id) => `https://vidlink.pro/movie/${id}`,
    tv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidcore",
    name: "VidCore",
    /* multi-server ArtPlayer (Pacific/Orion/Nova/Armor/Tiki/1Embed/
     * Cinextream/Filmubox/Movy/Orchestr/Overlook/VAPlayer/VidNest/
     * Viduki) with anime + subtitle support. */
    movie: (id) => `https://vidcore.org/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidcore.org/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidfast",
    name: "VidFast",
    /* multi-server player (vRapid/vEdge/Cobra/Cine/vFast/Horizon/
     * Bravo, 4K + multi-audio rows), subtitles, quality picker. */
    movie: (id) => `https://vidfast.vc/movie/${id}`,
    tv: (id, s, e) => `https://vidfast.vc/tv/${id}/${s}/${e}`,
  },
  {
    id: "twoembed",
    name: "2Embed",
    /* most reliable of the 2Embed family; TMDB numerics work on both
     * routes (their own embed code confirms). NB: direct (non-iframe)
     * hits bounce to a 2embed.skin watch page - inside our iframe it
     * serves the player, like the thousands of sites embedding it. */
    movie: (id) => `https://www.2embed.cc/embed/movie/${id}`,
    tv: (id, s, e) => `https://www.2embed.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "superembed",
    name: "SuperEmbed",
    /* multi-server failover; base URL only (directstream.php is dead).
     * multiembed.mov -> streamingnow.mov redirect is normal; a Cloud-
     * flare invisible check runs first and passes in real browsers. */
    movie: (id) => `https://multiembed.mov/${qs({ video_id: id, tmdb: 1 })}`,
    tv: (id, s, e) => `https://multiembed.mov/${qs({ video_id: id, tmdb: 1, s, e })}`,
  },
  {
    id: "moviesapi",
    name: "MoviesAPI",
    /* path is /movie/{id} (the old /embed/movie/{id} is gone). */
    movie: (id) => `https://moviesapi.to/movie/${id}`,
    tv: (id, s, e) => `https://moviesapi.to/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidspark",
    name: "VidSpark",
    /* same codebase as MoviesAPI, separate deployment. */
    movie: (id) => `https://vidspark.to/movie/${id}`,
    tv: (id, s, e) => `https://vidspark.to/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidsrcin",
    name: "VidSrc IN",
    /* VidSrc mirror (vsembed.ru backend) - failover pill for when
     * vidsrc.to itself is down; same route scheme. */
    movie: (id) => `https://vidsrc.in/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.in/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "netembed",
    name: "NetMirror Embed",
    /* netmirror.center's own ?embed=1 site player (the page the user
     * linked): TMDB-keyed movie/tv embeds with their season/episode
     * picker + Watch & Download inside. /tv/{id}/{s}/{e} 404s, so S/E
     * travel as best-effort s/e params (their picker covers the rest).
     * Full site page in the frame (PVRPlay-style); framing depends on
     * their headers on the open web, Electron strips via FRAME_HOSTS. */
    movie: (id) => `https://netmirror.center/movie/${id}/?embed=1`,
    tv: (id, s, e) => `https://netmirror.center/tv/${id}/?embed=1&s=${s}&e=${e}`,
  },
];

export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

export function embedUrl(
  provider: EmbedProvider,
  type: "movie" | "tv",
  id: number | string,
  opts: { s?: number; e?: number; startAt?: number } = {}
) {
  const base =
    type === "movie" ? provider.movie(String(id)) : provider.tv(String(id), opts.s ?? 1, opts.e ?? 1);
  const startAt =
    provider.startParam && opts.startAt && opts.startAt > 5 ? Math.floor(opts.startAt) : undefined;
  if (!startAt) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${provider.startParam}=${startAt}`;
}

/* ── Player postMessage events ──────────────────────────────────────────────
 * CineSrc documents loadedmetadata/ended/etc events (no periodic time
 * event); VidZee documents none. The parser stays
 * generic (JSON string or object, deep time-field scan) so continue-watching
 * tracking works automatically if/when they emit them.
 * NB: "progress" (%-fields) and epoch-ms "timestamp" fields are never read
 * as playback seconds. */

export type PlayerTime = { time: number; duration?: number; ended?: boolean; paused?: boolean };

const TIME_KEYS = [
  "currentTime", "current_time", "currenttime", "time", "position", "seconds", "elapsed",
];
const DURATION_KEYS = ["duration", "totalDuration", "total_duration", "length"];
const PLAYER_HOSTS = ["vidzee", "cinesrc", "peachify", "bingr", "pvrplay", "vidbolt", "netout", "vidout", "megaplay", "modiplay", "nxsha", "screenscape", "iqsmartgames", "vidsrc", "vidlink", "vidcore", "vidfast", "2embed", "multiembed", "streamingnow", "moviesapi", "vidspark", "netmirror"];
/** playback seconds can never reach this; epoch-ms "timestamp" fields do */
const MAX_PLAUSIBLE_SECONDS = 1e7;

function scan(obj: unknown, depth = 0): Partial<PlayerTime> {
  if (!obj || typeof obj !== "object" || depth > 3) return {};
  const out: Partial<PlayerTime> = {};
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    const kl = k.toLowerCase();
    if (kl === "timestamp") continue; // epoch-ms, not playback time
    if (TIME_KEYS.includes(kl) && typeof v === "number" && v >= 0 && v < MAX_PLAUSIBLE_SECONDS && out.time === undefined)
      out.time = v;
    else if (DURATION_KEYS.includes(kl) && typeof v === "number" && v > 0) out.duration = v;
    else if (kl === "type" || kl === "event" || kl === "eventname") {
      const s = String(v).toLowerCase();
      if (s.includes("end") || s.includes("complete")) out.ended = true;
      if (s.includes("pause")) out.paused = true;
    } else if (typeof v === "object") {
      const nested = scan(v, depth + 1);
      if (out.time === undefined && nested.time !== undefined) out.time = nested.time;
      if (out.duration === undefined && nested.duration !== undefined) out.duration = nested.duration;
      if (nested.ended) out.ended = true;
      if (nested.paused) out.paused = true;
    }
  }
  return out;
}

/** Extract playback time from a player postMessage event, if it is one */
export function parsePlayerEvent(event: MessageEvent): PlayerTime | null {
  if (typeof event.origin === "string" && !PLAYER_HOSTS.some((h) => event.origin.includes(h))) return null;
  let data: any = event.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const parsed = scan(data);
  return parsed.time !== undefined ? (parsed as PlayerTime) : null;
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};
