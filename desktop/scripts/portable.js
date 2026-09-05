/* Builds a portable Yetflix:
 *   1. bundles the site (assumes scripts/prepare.js already ran via npm)
 *   2. electron-packager -> dist-simple/Yetflix-win32-x64/Yetflix.exe
 *      (self-contained folder app: no install, no admin, no registry writes,
 *       runs from any folder or USB stick)
 *   3. zips it to dist-simple/Yetflix-Portable-win-x64.zip (single file to carry)
 * Pure ASCII output on purpose (renders on every Windows codepage). */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DESKTOP = path.join(__dirname, "..");
const OUT = path.join(DESKTOP, "dist-simple");
const APPDIR = path.join(OUT, "Yetflix-win32-x64");
const EXE = path.join(APPDIR, "Yetflix.exe");
const ZIP = path.join(OUT, "Yetflix-Portable-win-x64.zip");

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: DESKTOP, stdio: "inherit", shell: true, ...opts });
  if (r.status !== 0) {
    console.error("[FAIL] command failed: " + cmd + " " + args.join(" "));
    process.exit(r.status ?? 1);
  }
};

console.log(">> Step 1/3: packaging the app with electron-packager...");
run("npx", [
  "electron-packager", ".", "Yetflix",
  "--platform=win32", "--arch=x64",
  "--icon=build/icon.png",
  "--overwrite", "--prune=true",
  '--out=dist-simple',
  '--ignore="^/?dist$"', '--ignore="^/?dist-simple$"', '--ignore="^/?scripts$"',
  '--ignore="site-url.txt"',
]);

if (!fs.existsSync(EXE)) {
  console.error("[FAIL] expected app exe not found: " + EXE);
  process.exit(1);
}

console.log(">> Step 2/3: creating the portable zip...");
run("powershell", [
  "-NoProfile", "-Command",
  "Compress-Archive -Path '" + APPDIR + "' -DestinationPath '" + ZIP + "' -Force",
]);

const mb = (p, def) => {
  try { return (fs.statSync(p).size / 1024 / 1024).toFixed(1) + " MB"; } catch { return def; }
};

console.log(">> Step 3/3: done.");
console.log("");
console.log("[OK] Portable app folder : " + APPDIR);
console.log("                          (" + mb(EXE, "?") + " exe inside, run it directly)");
console.log("[OK] Single portable zip : " + ZIP + "  (" + mb(ZIP, "?") + ")");
console.log("");
console.log("How to use:");
console.log("  - Copy the zip to any PC or USB stick, unzip anywhere, run Yetflix.exe.");
console.log("  - No installation, no admin rights, nothing is written to the registry.");
console.log("  - Internet is needed for TMDB data, images and video playback.");
