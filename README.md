# Yetflix — by Yashraj 🍿

> A Netflix-style streaming UI. Crafted by **Yashraj**.

A high-performance, full-stack Netflix-style streaming app (inspired by
netflix.com / netout.pages.dev (inspiration)) built with **Next.js**,
**Tailwind CSS**, **Framer Motion** and the **TMDB API**, streaming through the
**[VidCore](https://vidcore.io)** embed player.

## ✨ Features

- **Who's watching?** — multi-profile gate with add/manage profiles (localStorage)
- **Netflix-style home** — rotating hero billboard with TMDB logo images, 15+ curated rows
  (Trending, Hollywood, Bollywood, South Indian, Korean / Chinese / Indian / US TV,
  Anime, Marvel, WWE, Top 10)
- **Netflix-style cards** — delayed hover pop with match %, quick Play / My List actions,
  Top-10 rank numerals, Continue-Watching progress bars
- **Browse pages** — Movies, TV Shows, Categories (genre tiles), Genre pages with
  infinite scroll
- **Instant search** — debounced, flicker-free (SWR `keepPreviousData`) multi-search
  across titles and people
- **Title pages** — backdrop hero, cast, seasons, YouTube trailer modal, More Like This
- **VidCore player** — `/watch/movie/{tmdbId}` and `/watch/tv/{tmdbId}/{season}/{episode}`
  with an episode browser and next-episode flow
- **My List & Continue Watching** — per-profile, persisted

## ⚡ Performance ("no buffering while scrolling & searching")

| Technique | Where |
|---|---|
| SWR global cache + request dedupe | every data view |
| localStorage snapshot cache → instant paint, background revalidate | `src/lib/tmdb.ts` |
| Transform-based (GPU) carousel paging, no layout thrash | `src/components/Row.tsx` |
| Lazy, async-decoded images straight from TMDB CDN (pre-sized variants) | everywhere |
| `content-visibility: auto` on off-screen rows & grid cells | rows, grids |
| Debounced search + `keepPreviousData` | search |
| Backend proxy with `s-maxage` + `stale-while-revalidate` | `/api/tmdb/*` |

## 🏗 Architecture

```
src/
  app/
    api/tmdb/[...path]/route.ts   ← backend proxy (key stays server-side, HTTP-cached)
    page.tsx                      ← profile gate ("Who's watching?")
    home/                         ← hero + rows
    movies/ tv/ categories/       ← browse
    genres/[type]/[id]/           ← genre browse
    search/                       ← instant search
    title/[type]/[id]/            ← details
    watch/[type]/[id]/            ← VidCore player + episodes
    my-list/
  components/                     ← Navbar, HeroBillboard, Row, Card, BrowseGrid…
  lib/                            ← tmdb client (proxy→direct fallback), storage, rows
```

**Hybrid data path:** the client first calls the backend proxy `/api/tmdb/...`
(key server-side, responses cached). If the proxy can't reach TMDB (e.g. restricted
networks or purely-static hosting), the client transparently falls back to calling
TMDB directly — exactly how static Cloudflare Pages deployments work.

## 🚀 Getting started

```bash
npm install
cp .env.example .env.local   # add your TMDB key (free: themoviedb.org → Settings → API)
npm run dev                  # http://localhost:3000
```

> **Note:** `.env.local` is git-ignored (it holds your key), so a fresh clone does **not**
> include it — create it before starting, and restart the server after editing it.
> Windows cmd: `copy .env.example .env.local` · PowerShell: `Copy-Item .env.example .env.local`

Production:

```bash
npm run build && npm start
```

## 🛠 Troubleshooting

**Empty grids / "TMDB API key isn't set up yet" / search finds nothing**

The TMDB key is missing or wasn't loaded:

1. Create `.env.local` in the **project root** (not inside `src/`), with the **same key** in both variables:
   ```env
   TMDB_API_KEY=your_key
   NEXT_PUBLIC_TMDB_API_KEY=your_key
   ```
2. Fully stop the dev server (`Ctrl+C`) and start it again — env files are read **only at startup**. For production, re-run `npm run build` too.
3. Verify the proxy: open <http://localhost:3000/api/tmdb/trending/movie/week> — you should see JSON with a `results` array. If it says `no_api_key`, the file isn't being found (check the name: `.env.local`, no `.txt` ending).

**"TMDB rejected the API key (401)"** — the key value is wrong: re-copy it (no quotes/spaces) from
[themoviedb.org → Settings → API](https://www.themoviedb.org/settings/api). You can test the key
directly in a browser:
`https://api.themoviedb.org/3/trending/movie/week?api_key=YOUR_KEY`

**"Can't reach TMDB"** — the machine can't access `api.themoviedb.org`: check VPN/DNS/firewall/proxy.

**Hydration errors** — fixed; if one appears after upgrading, do a hard refresh (`Ctrl+Shift+R`).

Deploy anywhere Node runs (Vercel, Fly, Render, Docker) or adapt to Cloudflare
via OpenNext. Set `TMDB_API_KEY` / `NEXT_PUBLIC_TMDB_API_KEY` in the host's env.

## 🔑 Environment variables

| Variable | Purpose |
|---|---|
| `TMDB_API_KEY` | server-side proxy key |
| `NEXT_PUBLIC_TMDB_API_KEY` | browser fallback key (used only when the proxy is unreachable) |

## 📺 Player

VidCore embeds: `https://vidcore.io/movie/{id}` and
`https://vidcore.io/tv/{id}/{season}/{episode}` with `autoPlay` and `theme`
query params (see [docs](https://vidcore.io)). Playback/ads are served by
VidCore — this repo only embeds it.

## ⚖️ Disclaimer

This product uses the TMDB API but is not endorsed or certified by TMDB.
For educational/personal use.
