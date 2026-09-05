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

/* Player-friendly popup hosts (server selection / external players) */
const POPUP_HOSTS = [
  "nxsha.space",
  "youtube.com", "youtube-nocookie.com",
  "googlevideo.com", "google.com", "tmdb.org", "themoviedb.org",
];

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

    win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 600,
      backgroundColor: "#0b0b0f",
      autoHideMenuBar: true,
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

    // player popups (vidcore server selection etc.) open as in-app child
    // windows; everything else goes to the system browser
    win.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const u = new URL(url);
        if (POPUP_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) {
          return {
            action: "allow",
            overrideBrowserWindowOptions: {
              width: 1050, height: 650, autoHideMenuBar: true,
              backgroundColor: "#0b0b0f", title: "Yetflix Player",
              parent: win,
            },
          };
        }
      } catch {}
      shell.openExternal(url);
      return { action: "deny" };
    });
    // block full navigations away from the app
    win.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(site)) {
        e.preventDefault();
        shell.openExternal(url);
      }
    });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", killServer);
  process.on("exit", killServer);
}
