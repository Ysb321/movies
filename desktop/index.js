/* Yetflix desktop - Electron main process.
 * Bundles the Next.js standalone server (desktop/app) and shows it in an
 * app window. The server runs as a child process using Electron's own
 * binary in Node mode (ELECTRON_RUN_AS_NODE), so no system Node is needed. */
const { app, BrowserWindow, shell, session } = require("electron");
/* uBlock-grade blocking: Ghostery adblocker on EasyList + EasyPrivacy
 * filter lists (github.com/ghostery/adblocker). Optional at runtime - if
 * the package is missing or lists cannot download, the built-in static
 * AD_HOSTS filter below keeps protecting the app. */
let ElectronBlocker = null;
try { ({ ElectronBlocker } = require("@ghostery/adblocker-electron")); } catch {}
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
let site = "";

/* Player-friendly popup hosts (the "Open in browser" button / video CDNs).
 * Anything NOT on this list that tries to open a window is an ad popup
 * and gets blocked - popups never leave the app. */
const POPUP_HOSTS = [
  "vidzee.wtf", "cinesrc.st", "peachify.top", "peachify.pro",
  "bingr.one", "pvrplay.online", "vidbolt.xyz",
  "youtube.com", "youtube-nocookie.com",
  "googlevideo.com", "google.com", "tmdb.org", "themoviedb.org",
];

/* Server 5 (PVRPlay) shows "Join Telegram" banners/popups from their own
 * page inside the iframe. Cross-origin pages cannot be edited, but
 * insertCSS reaches EVERY frame of a webContents (same mechanism
 * Ghostery's cosmetic filters use), so we hide anything Telegram-shaped.
 * Other servers have no t.me elements - selectors simply never match. */
const HIDE_PROMO_CSS = `
  a[href*="t.me" i], a[href*="telegram.me" i], a[href*="telegram.org" i] {
    display: none !important;
  }
  [class*="telegram" i], [id*="telegram" i] {
    display: none !important;
  }
`;

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

/* Some embed providers send X-Frame-Options / CSP frame-ancestors that
 * forbid iframing (e.g. multiembed.mov / SuperEmbed). The app controls
 * its own network stack, so those headers can be stripped for the known
 * player hosts - making the frame load. (A plain website can never do
 * this: the headers come from the provider's server.) */
const FRAME_HOSTS = ["pvrplay.online", "bingr.one", "megaplay.buzz"]; // full sites - strip any frame-block headers
const stripFrameHeaders = (details, callback) => {
  try {
    const u = new URL(details.url);
    if (FRAME_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) {
      const headers = details.responseHeaders || {};
      let changed = false;
      for (const k of Object.keys(headers)) {
        const kl = k.toLowerCase();
        if (kl === "x-frame-options") { delete headers[k]; changed = true; }
        else if (kl === "content-security-policy" || kl === "content-security-policy-report-only") {
          const kept = headers[k].filter((v) => !String(v).includes("frame-ancestors"));
          if (kept.length !== headers[k].length) {
            if (kept.length) headers[k] = kept; else delete headers[k];
            changed = true;
          }
        }
      }
      if (changed) return callback({ responseHeaders: headers });
    }
  } catch {}
  callback({});
};
const enableFrameHeaderStrip = () => {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["http://*/*", "https://*/*"] },
    stripFrameHeaders
  );
};
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
    site = `http://127.0.0.1:${port}`;

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
    // (static baseline; superseded by the EasyList blocker when it loads)
    const AD_FILTER = { urls: ["http://*/*", "https://*/*"] };
    session.defaultSession.webRequest.onBeforeRequest(AD_FILTER, (details, callback) =>
      callback({ cancel: isAdRequest(details.url) })
    );

    /* EasyList engine (ghostery/adblocker-electron). NB: Electron allows
     * ONE webRequest listener per event - enableBlockingInSession REPLACES
     * the static filter registered above (that is correct and intended).
     * Never call onBeforeRequest(filter) to "clean up" afterwards: that
     * unsubscribes the blocker itself, which is exactly the bug that let
     * ads through before. On any failure the static filter simply stays. */
    if (ElectronBlocker && typeof fetch === "function") {
      const cachePath = path.join(app.getPath("userData"), "easylist-cache.bin");
      (async () => {
        try {
          // refresh stale lists weekly
          try {
            if (Date.now() - fs.statSync(cachePath).mtimeMs > 7 * 86400000) fs.unlinkSync(cachePath);
          } catch {}
          const blocker = await ElectronBlocker.fromPrebuiltAdsOnly(fetch, {
            path: cachePath,
            read: (p) => fs.promises.readFile(p),
            write: (p, buf) => fs.promises.writeFile(p, buf),
          });
          blocker.enableBlockingInSession(session.defaultSession);
          let blocked = 0;
          blocker.on("request-blocked", ({ url }) => {
            blocked++;
            if (blocked === 1) console.log("[OK] first ad blocked: " + url);
            else if (blocked % 25 === 0) console.log("[OK] ads blocked so far: " + blocked);
          });
          enableFrameHeaderStrip(); // replaces blocker's inert CSP listener
          console.log("[OK] EasyList ad blocker ACTIVE (fromPrebuiltAdsOnly)");
        } catch (err) {
          enableFrameHeaderStrip();
          console.log("[WARN] EasyList blocker unavailable, static filter only: " + (err && err.message));
        }
      })();
    } else {
      enableFrameHeaderStrip();
      console.log("[WARN] ad-blocker package missing (run: cd desktop && npm install) - static filter only");
    }

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
      try { wc.insertCSS(HIDE_PROMO_CSS, { cssOrigin: "user" }); } catch {}
      /* no in-app feature uses window.open anymore - every popup attempt
       * from any frame (player iframes included, e.g. unsandboxed Server 3)
       * is an ad: denied outright. Whitelisted hosts remain navigable. */
      wc.setWindowOpenHandler(() => ({ action: "deny" }));
      wc.on("will-navigate", (e, url) => {
        if (!site || (!url.startsWith(site) && !isPopupHost(url))) e.preventDefault();
      });
    };
    /* every webContents ever created - the main window, child windows AND
     * iframes (players run unsandboxed when they demand it; their popups
     * still cannot escape the whitelist) */
    app.on("web-contents-created", (_e, wc) => popupGuard(wc));
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", killServer);
  process.on("exit", killServer);
}
