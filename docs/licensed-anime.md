# Server 18 — Licensed Anime (official licensor channels)

Pill: **“Anime 2 · Official”** (anime titles only, sits after the MegaPlay
“Anime 1” pill).

Unlike every other lane in this repo, this one does not resolve files off
third-party hosts. It finds the episode on the **rightsholder’s own
YouTube channel** and plays it in YouTube’s player, so the view, the ads
and the revenue all land with the licensor.

## Channels

| Channel | Operator | Notes |
| --- | --- | --- |
| Muse Asia (`UCGbshtvS9t-8CW11W7TooQg`) | MUSE Communication Singapore | SEA + India simulcast licensee; official English subs, full episodes |
| Ani-One Asia (`UC0wNSTMWIL3qaorLx0jie6A`) | MediaLink Entertainment (HK) | Asia licensee; English + regional subs, some dubs |
| Gundam Channel INTL (`UCkdIq9j7cQQxHZfXpu9ZO4Q`) | Sunrise / Bandai Namco | the Gundam library, official subs/dubs |

Add more with the `LICENSED_ANIME_CHANNELS` env var:

```
LICENSED_ANIME_CHANNELS="Nozomi Entertainment:UCxxxxxxxxxxxxxxxxxxxxxx,Ani-One Ultra:UCyyyyyyyyyyyyyyyyyyyyyy"
```

Format is `Name:ChannelId`, comma-separated; ids must match `UC…`.
**Only add channels the rightsholder or their appointed licensee
operates** — that property is the entire point of this lane.

## Flow

```
watch page (anime title, pill "Anime 2 · Official")
  -> LicensedAnimeSources
  -> GET /api/licensedanime/stream/{movie|series}/{tmdb}[:{s}:{e}]?title=&alt=
  -> resolveLicensedAnime()  (src/lib/licensedanime.ts)
  -> per channel: Data API search.list  OR  channel /search HTML
  -> score, filter, rank
  -> youtube-nocookie.com/embed/{videoId}
```

### Resolution strategies

1. **YouTube Data API v3** — used when `YOUTUBE_API_KEY` is set.
   `search.list` scoped per `channelId`. Stable shape, cheap at our
   volume. Recommended for production.
2. **HTML fallback** — no key required. Fetches
   `youtube.com/channel/{id}/search?query=…` and walks the embedded
   `ytInitialData` blob (`videoRenderer` / `gridVideoRenderer` /
   `compactVideoRenderer`), with a regex sweep as a last resort. This is
   the default when no key is configured, and it is the part most likely
   to need maintenance if YouTube reshapes their payload.

### Matching

TMDB has no YouTube ids, so candidates are scored rather than trusted:

- **Title similarity** — stopword-stripped token overlap of the TMDB
  title (and `original_name`/`original_title`, which catches romaji-only
  uploads) against the video title. Floor: `MIN_SCORE = 0.45`.
- **Episode number** — parsed from the upload title
  (`Episode 07`, `Ep. 7`, `- 07 (END)`, `#07`, …). If an upload advertises
  an episode number and it is not the requested one, it is **dropped** —
  never “close enough”. Unnumbered uploads survive as weak fallbacks.
- **Noise filter** — trailers, PVs, teasers, OP/ED, recaps, clips,
  interviews and compilations are rejected outright.
- **Audio bonus** — small boost when the upload matches the requested
  `sub`/`dub`.

Ranked results are returned (max 12); the top one auto-plays and the rest
appear in the in-player “sources” drawer, which is how a user flips
between a Muse sub and an Ani-One dub of the same episode.

## Contract

```jsonc
{
  "title": "That Time I Got Reincarnated as a Slime",
  "sources": [{
    "key": "UCGb…:dQw4w9WgXcQ",
    "videoId": "dQw4w9WgXcQ",
    "title": "… - Episode 01 [English Sub]",
    "channel": "Muse Asia",
    "url":   "https://www.youtube.com/watch?v=…",
    "embed": "https://www.youtube-nocookie.com/embed/…",
    "episode": 1,
    "audio": "sub",
    "score": 1.45
  }],
  "noSource": false,
  "laneError": "…",   // only on failure
  "diag": "mode=html | Muse Asia=18 | Ani-One Asia=0 | …"
}
```

Failures return **200 + `laneError` + `diag`** (same convention as the
castle/nuvio lanes) so the UI can name the stage that broke instead of
showing a bare network error. Input guards return 403: bad `kind`,
non-numeric id, missing title.

Caching: `s-maxage=1800, stale-while-revalidate=86400` — channel
catalogues change slowly and this keeps Data API quota use low.

## Expected misses

These licences are **per-title and territorial**. Muse Asia covers SEA +
India for most of its catalogue; Ani-One varies by title. So:

- a title genuinely absent from all three channels shows the explicit
  “Not in the licensed catalogue” empty state (with a direct
  search-on-Muse-Asia link) rather than a wrong-episode guess;
- a video that *is* found may still be region-locked for a given viewer —
  YouTube’s own player reports that;
- catalogues rotate (titles get added and removed), so a miss today can
  become a hit later. The Retry button re-runs the resolve.

This is the honest trade-off of the lane: a smaller catalogue than an
aggregator, in exchange for every play being one the licensor gets paid
for.

## Files

| Path | Role |
| --- | --- |
| `src/lib/licensedanime.ts` | channel list, discovery (Data API + HTML), scoring |
| `src/app/api/licensedanime/stream/[kind]/[id]/route.ts` | edge route, guards, contract |
| `src/components/LicensedAnimeSources.tsx` | player + source drawer + empty/error states |
| `src/lib/player.ts` | `PROVIDERS` entry (`id: "licensedanime"`, `animeOnly`, `vlcOnly`) |

## Verification status

Channel ids confirmed against MUSE Communication Singapore’s own site
(`e-muse.com.sg` structured data) and corroborating sources. Matcher
logic is covered by assertions over real upload-title shapes
(episode parsing, similarity gate, noise filter — 14/14 passing).
The live upstream fetch could **not** be exercised from the build
sandbox (no outbound network), so the first run in an environment with
egress should confirm the HTML fallback still parses current
`ytInitialData`; if YouTube has reshaped it, set `YOUTUBE_API_KEY` to
switch to the documented API path.
