# Yetflix Desktop 🖥️

Turn the Yetflix site into a **runnable Windows executable** — three ways,
from most-featured to most-bulletproof:

| Method | Command | Result |
|---|---|---|
| 🎒 **Portable** *(recommended)* | `npm run portable` | `dist-simple/Yetflix-Portable-win-x64.zip` — self-contained app + the unzip-anywhere folder (`Yetflix-win32-x64/Yetflix.exe`). No install, no admin, no registry. Runs from USB |
| ⚡ Simple packager | `npm run dist:simple` | `dist-simple/Yetflix-win32-x64/Yetflix.exe` — same folder app, without the zip step |
| 📦 Full installer | `npm run dist` | `dist/Yetflix-Setup-1.0.0.exe` + `Yetflix-Portable-1.0.0.exe` via electron-builder |
| 🪟 No packaging at all | double-click `Yetflix-AppWindow.bat` | Yetflix in a chromeless **Edge app window** (preinstalled on Win 10/11) |

> If `npm run dist` (electron-builder) fails on your PC — antivirus and
> folder-permission interference are the usual culprits — just use
> `npm run dist:simple` or the AppWindow bat. Same app, different wrapping.

## Build the .exe (on your Windows PC)

```powershell
cd desktop
npm install        # first time — downloads Electron (~100 MB, one time)
npm run dist       # builds the site + packages Yetflix.exe
```

Output in `desktop/dist/`:

| File | What it is |
|---|---|
| `Yetflix-Setup-1.0.0.exe` | One-click installer (start-menu shortcut) |
| `Yetflix-Portable-1.0.0.exe` | Single portable .exe — no install, run from USB |

Double-click and Yetflix opens as its own desktop app (dark window, custom
icon, external links open in the system browser). The site runs from a tiny
local server bundled inside the app — **fully offline UI**; only TMDB data,
images and the VidCore player need internet.

> First launch may show Windows SmartScreen ("unknown publisher") — click
> *More info → Run anyway*. That's normal for unsigned exes; signing certs
> cost money and are optional.

## Run the app without building an .exe

```powershell
cd desktop
npm install
npm run start       # builds the site if needed, then opens the desktop app
```

## Zero-build quick run (plain browser)

Double-click **`Yetflix-QuickRun.bat`** — installs deps if missing, builds if
needed, starts the site and opens your browser at http://localhost:3000/home.

## How it works

- `scripts/prepare.js` builds the Next.js site in **standalone mode**
  (`BUILD_STANDALONE=1`) and copies the self-contained server into `app/`
- `main.js` (Electron) starts that server on a free local port using
  Electron's own binary in Node mode (**no Node.js needed on the target PC**),
  waits for it to be ready, then opens the app window
- `electron-builder` packages it all into the .exe files (config in
  `package.json` → `build`)

## Rebuilding after you change the site

Any change to the site code → just re-run `npm run dist` (it rebuilds the
site automatically). Bump `version` in `desktop/package.json` for a new
exe name.
