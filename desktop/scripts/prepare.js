/* Builds the Yetflix site in standalone mode and copies it into desktop/app
 * so Electron can bundle it. Run from the desktop/ folder:  npm run site
 * ASCII-only output (renders on every Windows codepage). */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const nextDir = path.join(root, ".next");
const standalone = path.join(nextDir, "standalone");
const appDir = path.join(__dirname, "..", "app");

/* Locate the standalone entry even if a different workspace root made Next
   nest it (e.g. .next/standalone/movies/server.js). Returns the directory
   that directly contains server.js, shallowest match wins. */
const findEntryDir = (dir) => {
  let best = null;
  const walk = (d, depth) => {
    if (depth > 4) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", ".cache", "cache"].includes(e.name)) walk(p, depth + 1);
      } else if (e.name === "server.js") {
        if (!best || depth < best.depth) best = { dir: d, depth };
      }
    }
  };
  walk(dir, 0);
  return best ? best.dir : null;
};

const build = () => {
  const r = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit", shell: true });
  return r.status === 0;
};

console.log(">> Building Yetflix (Next.js standalone)...");
if (!build()) {
  console.error("[FAIL] Site build failed. See output above.");
  process.exit(1);
}

/* Retry once from a clean slate: a stale .next cache can omit the
   standalone output when the output mode changed between builds. */
let entryDir = findEntryDir(standalone);
if (!entryDir) {
  console.log(">> Standalone output missing. Clearing the build cache and rebuilding once...");
  fs.rmSync(nextDir, { recursive: true, force: true });
  if (!build()) {
    console.error("[FAIL] Site build failed on the clean rebuild.");
    process.exit(1);
  }
  entryDir = findEntryDir(standalone);
}
if (!entryDir) {
  console.error("[FAIL] Standalone output still missing (.next/standalone/**/server.js).");
  console.error("       Try deleting any stray package-lock.json in parent folders, then re-run.");
  process.exit(1);
}
console.log(">> Standalone entry found at: " + path.relative(root, path.join(entryDir, "server.js")));

console.log(">> Copying bundle into desktop/app...");
fs.rmSync(appDir, { recursive: true, force: true });
fs.cpSync(entryDir, appDir, { recursive: true });
/* nested layouts keep node_modules at the standalone root */
const sharedMods = path.join(standalone, "node_modules");
if (fs.existsSync(sharedMods) && !fs.existsSync(path.join(appDir, "node_modules"))) {
  fs.cpSync(sharedMods, path.join(appDir, "node_modules"), { recursive: true });
}
fs.cpSync(path.join(nextDir, "static"), path.join(appDir, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(appDir, "public"), { recursive: true });

/* wipe stale packaging output + verify the Electron entry exists */
const dist = path.join(__dirname, "..", "dist");
fs.rmSync(dist, { recursive: true, force: true });
const entry = path.join(__dirname, "..", "index.js");
if (!fs.existsSync(entry)) {
  console.error("[FAIL] desktop/index.js is missing. Run: git pull inside the repo.");
  process.exit(1);
}

/* ── VLC for codec-limited Multi Dub links (MKV / Dolby / DTS) ──
 * Downloaded ONCE into desktop/vlc/ (kept across builds; the portable
 * packaging includes it automatically). If it fails the app still works
 * - those links just play best-effort in the built-in player. */
async function ensureVlc() {
  const { spawnSync } = require("child_process");
  const vlcDir = path.join(__dirname, "..", "vlc");
  const vlcExe = path.join(vlcDir, "vlc.exe");
  if (fs.existsSync(vlcExe)) { console.log(">> VLC already present (desktop/vlc)."); return; }

  const VER = "3.0.21";
  const url = `https://get.videolan.org/vlc/${VER}/win64/vlc-${VER}-win64.zip`;
  const tmp = path.join(__dirname, "..", "vlc-download.zip");
  const tmpDir = path.join(__dirname, "..", "vlc-extract");
  console.log(">> Downloading VLC (one-time, ~50 MB) for full-codec playback...");
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmp, buf);
    console.log(">> Extracting VLC...");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    /* Windows 10+ ships bsdtar, which handles zip; macOS/Linux tar too */
    const r = spawnSync("tar", ["-xf", tmp, "-C", tmpDir], { shell: true });
    if (r.status !== 0) throw new Error("tar exited " + r.status);
    /* the zip contains a versioned folder - flatten it into desktop/vlc */
    const inner = fs.readdirSync(tmpDir).find((e) => {
      try { return fs.statSync(path.join(tmpDir, e)).isDirectory(); } catch { return false; }
    });
    if (!inner) throw new Error("zip layout unexpected");
    fs.rmSync(vlcDir, { recursive: true, force: true });
    fs.renameSync(path.join(tmpDir, inner), vlcDir);
    if (!fs.existsSync(vlcExe)) throw new Error("vlc.exe not found after extract");
    console.log("[OK] VLC ready at desktop/vlc (MKV/Dolby links get full audio).");
  } catch (e) {
    console.log("[WARN] VLC download failed (" + (e && e.message ? e.message : e) + ").");
    console.log("       Codec-limited links will play best-effort in-app.");
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
ensureVlc().then(() => {
  console.log("[OK] Site bundled at desktop/app. Run: npm run start  or  npm run portable  or  npm run dist");
});
