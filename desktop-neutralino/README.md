# Yetflix Neutralino — tiny desktop client (~2–5 MB exe) 🪶

A [Neutralino.js](https://neutralino.js.org) wrapper that turns the Yetflix
site into a desktop app — **without bundling Chromium/Node** (that's why it's
~50× smaller than the Electron build). It uses the OS webview: **WebView2** on
Windows (preinstalled on Windows 10/11), WebKit on macOS/Linux.

Unlike the Electron package (`../desktop`), Neutralino can't run the Next.js
server inside the exe — so this client loads the site from a **URL**:

| Mode | site-url.txt | Notes |
|---|---|---|
| **Deployed (recommended)** | `https://your-site.vercel.app/home` | Deploy the site free (below) → exe always runs the latest version |
| **Local** | `http://localhost:3000/home` | Run `npm start` in the repo root first; exe works while it runs |

## 1) Deploy the site (one time, free)

```powershell
cd ..                      # repo root
npm i -g vercel
vercel                     # link/create project
# add the API keys in the dashboard (Settings → Environment Variables):
#   TMDB_API_KEY, NEXT_PUBLIC_TMDB_API_KEY
vercel --prod
```

You'll get a URL like `https://yetflix-xxxx.vercel.app` — the server-side
proxy runs there too, so your TMDB key stays private.

## 2) Build the tiny exe

```powershell
cd desktop-neutralino
npm install                # installs the neu CLI (small)
npm run build              # downloads Neutralino runtime (first run) + builds
```

→ **`dist/Yetflix/Yetflix-win_x64.exe`** (also mac/linux/arm binaries in the
same folder). Double-click → Yetflix in its own window with the app icon.

To change the target URL later: edit `site-url.txt` → `npm run build`.

## Requirements on the target PC

- Windows 10/11 with **WebView2** (preinstalled on current systems; if
  missing: https://developer.microsoft.com/microsoft-edge/webview2 — the
  Evergreen bootstrapper, one small install)
- Internet (Yetflix streams from TMDB + VidCore anyway)

## Which one should I use?

| | `../desktop` (Electron) | `desktop-neutralino` |
|---|---|---|
| exe size | ~150 MB | **~2–5 MB** |
| Runs without internet | UI yes (cached) | Needs the site URL |
| Bundles full site + server | ✅ | ❌ (loads deployed/local site) |
| RAM usage | Higher (bundled Chromium) | Lower (system webview) |

Keep both: Electron for a fully self-contained offline app; Neutralino for a
micro-sized client on top of your deployed site.
