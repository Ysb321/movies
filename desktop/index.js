/* Yetflix desktop - Electron main process.
 * Bundles the Next.js standalone server (desktop/app) and shows it in an
 * app window. The server runs as a child process using Electron's own
 * binary in Node mode (ELECTRON_RUN_AS_NODE), so no system Node is needed. */
const { app, BrowserWindow, shell, session } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const net = require("net");

// when packaged with asar, app/** is unpacked to app.asar.unpacked/ - the
// spawned Node child (ELECTRON_RUN_AS_NODE) can only read real files
const APP_ROOT = __dirname.includes("app.asar")
  ? __dirname.replace("app.asar", "app.asar.unpacked")
  : __dirname;
const SERVER = path.join(APP_ROOT, "app", "server.js");
let child = null;
let win = null;

/* Player-friendly popup hosts (the "Open in browser" button / video CDNs).
 * Anything NOT on this list that tries to open a window is an ad popup
 * and gets blocked - popups never leave the app. */
const POPUP_HOSTS = [
  "vidzee.wtf", "cinesrc.st",
  "youtube.com", "youtube-nocookie.com",
  "googlevideo.com", "google.com", "tmdb.org", "themoviedb.org",
];

const isPopupHost = (url) => {
  try {
    const u = new URL(url);
    return POPUP_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch { return false; }
};

/* Ad/tracker request blocker: cancels matching requests in EVERY frame
 * (main page + player iframes + child windows) before they load, which
 * kills banner ads, popunder scripts and trackers at the network level.
 * Curated to ad networks only - player CDNs (vidzee.wtf, cinesrc.st,
 * googlevideo, tmdb, wsrv.nl) are never matched. */
const AD_HOSTS = [
  "popads.net", "popcash.net", "adcash.com", "admaven.com", "clickadu.com",
  "hilltopads.net", "propellerads.com", "propellerclick.com", "adsterra.com",
  "adsterranetwork.com", "exoclick.com", "exosrv.com", "realsrv.com",
  "juicyads.com", "trafficjunky.com", "trafficstars.com", "galaksion.com",
  "clickaine.com", "onsrvr.com", "onclckds.com", "wyvars.com",
  "mgid.com", "revcontent.com", "taboola.com", "outbrain.com",
  "doubleclick.net", "googlesyndication.com", "googleadservices.com",
  "google-analytics.com", "googletagmanager.com", "googletagservices.com",
  "adnxs.com", "rubiconproject.com", "pubmatic.com", "criteo.com",
  "criteo.net", "smartadserver.net", "adskeeper.com", "adsupply.com",
  "popunder.net", "popunderads.com", "adcron.com", "adspyglass.com",
  "adplexity.com",
];
const AD_URL_HINTS = ["popunder"];
const isAdRequest = (url) => {
  try {
    const u = new URL(url);
    if (AD_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) return true;
    return AD_URL_HINTS.some((p) => u.href.includes(p));
  } catch { return false; }
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

const waitForServer = (url, timeoutMs = 45000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http
        .get(url, (res) => (res.statusCode < 500 ? resolve() : res.resume()))
        .on("error", () => {
          if (Date.now() - started > timeoutMs) reject(new Error("server did not start"));
          else setTimeout(tick, 300);
        });
    };
    tick();
  });

const killServer = () => {
  if (child && !child.killed) {
    try { child.kill(); } catch {}
    child = null;
  }
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  /* allow embedded-player media without a user gesture */
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

  app.whenReady().then(async () => {
    /* grant media/fullscreen/clipboard permissions to the app session */
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
      const ok = ["media", "fullscreen", "clipboard-read", "clipboard-sanitized-write", "pointerLock"].includes(permission);
      cb(ok);
    });
    if (!fs.existsSync(SERVER)) {
      const { dialog } = require("electron");
      dialog.showErrorBox(
        "Yetflix - site not bundled",
        "The app bundle is missing (desktop/app). Run:  npm run dist   or   npm run start   from the desktop/ folder to build it first."
      );
      app.quit();
      return;
    }

    const port = await freePort();
    const site = `http://127.0.0.1:${port}`;

    child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
      stdio: "ignore",
    });
    child.on("exit", () => { child = null; });

    try {
      await waitForServer(`${site}/home`);
    } catch (err) {
      const { dialog } = require("electron");
      dialog.showErrorBox("Yetflix", "The local server failed to start: " + err.message);
      app.quit();
      return;
    }

    // cancel ad/tracker requests across all frames of the default session
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*"] },
      (details, callback) => callback({ cancel: isAdRequest(details.url) })
    );

    win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 600,
      backgroundColor: "#0b0b0f",
      autoHideMenuBar: true,
      icon: path.join(__dirname, "build", "icon.png"),
      title: "Yetflix - by Yashraj",
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        spellcheck: false,
      },
    });

    win.once("ready-to-show", () => win.show());
    await win.loadURL(`${site}/home`);

    /* Popup guard: only whitelisted player hosts may open windows (they
     * open as in-app child windows). Every other window.open / target=_blank
     * is an ad popup (popads etc.) and is denied outright - never sent to
     * the system browser. Applied recursively to child windows too. */
    const popupGuard = (wc) => {
      wc.setWindowOpenHandler(({ url }) => {
        if (isPopupHost(url)) {
          return {
            action: "allow",
            overrideBrowserWindowOptions: {
              width: 1050, height: 650, autoHideMenuBar: true,
              backgroundColor: "#0b0b0f", title: "Yetflix Player",
              parent: win,
            },
          };
        }
        return { action: "deny" };
      });
      wc.on("will-navigate", (e, url) => {
        if (!url.startsWith(site) && !isPopupHost(url)) e.preventDefault();
      });
      wc.on("did-create-window", (child) => popupGuard(child.webContents));
    };
    popupGuard(win.webContents);
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", killServer);
  process.on("exit", killServer);
}
