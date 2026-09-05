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

const standaloneOk = () => fs.existsSync(path.join(standalone, "server.js"));

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
if (!standaloneOk()) {
  console.log(">> Standalone output missing. Clearing the build cache and rebuilding once...");
  fs.rmSync(nextDir, { recursive: true, force: true });
  if (!build() || !standaloneOk()) {
    console.error("[FAIL] Standalone output still missing (.next/standalone/server.js).");
    console.error("       Make sure the repo is current: git pull origin arena/01a070de-movies");
    process.exit(1);
  }
}

console.log(">> Copying bundle into desktop/app...");
fs.rmSync(appDir, { recursive: true, force: true });
fs.cpSync(standalone, appDir, { recursive: true });
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

console.log("[OK] Site bundled at desktop/app. Run: npm run start  or  npm run portable  or  npm run dist");
