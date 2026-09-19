# Server 9 (WebStreamr) — multi-dub streams + audio switching

Stremio-addon passthrough (`src/app/api/webstreamr/stream/[kind]/[id]/route.ts`):
addon host pinned, config `{multi: "on", hi: "on", ta: "on", te: "on"}`
(India-first pack: multi + Hindi/Tamil/Telugu dubs; each extra language
costs scrape time). Responses are live (~90s worst case), no cache.

## Row data model (`parseStream` in `src/lib/vlc.ts`)

Addon `name` lines are `"WebStreamrMBG\n<flags>\n<quality>"`:

- `audio` = the **flags line** (per-row audio language, e.g. Hindi / Dual
  Audio / Tamil — flag emoji included as the addon sends it).
- `quality` = last name line; `file`/`size`/`source` from `title` lines.
- `fileUrl` (direct extract) or `pageUrl` (needs generation).

## Audio-language changer (2026-09-09)

Per the user's "change lang func" ask (audio vote): `SitePlayer`
`showAudio` renders an in-player **audio selector** (Cineverse
multi-audio equivalent) over the distinct `sources[].audio` values,
hidden unless 2+ languages. Hops keep quality when the picked language
has it, else take that language's first row; labels follow truth via
`syncSelectorLabels()` (failed generations revert). Enabled on Server 9
(`VlcSources`); NOT on the NetMirror lanes — their API ships a single
original-audio encode per title (streams carry url+resolution+size only,
verified against the raw `net27.cc/api/embed-tmdb/550` response), so an
audio selector there would be a lie. DesiDDL rows do carry dub markers
(`parseAudio`: Dual Audio / Hindi) but need interactive hub generation
per row, so in-player hopping can't work there either.
