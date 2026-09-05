/* Builds the Yetflix site in standalone mode and copies it into desktop/app
 * so Electron can bundle it. Run from the desktop/ folder:  npm run site  */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const nextDir = path.join(root, ".next");
const standalone = path.join(nextDir, "standalone");
const appDir = path.join(__dirname, "..", "app");

console.log("▶ Building Yetflix (Next.js standalone)…");
const build = spawnSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, BUILD_STANDALONE: "1" },
});
if (build.status !== 0) {
  console.error("✗ Site build failed — see output above.");
  process.exit(build.status ?? 1);
}

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("✗ Standalone output missing (.next/standalone/server.js).");
  process.exit(1);
}

console.log("▶ Copying bundle into desktop/app…");
fs.rmSync(appDir, { recursive: true, force: true });
fs.cpSync(standalone, appDir, { recursive: true });
fs.cpSync(path.join(nextDir, "static"), path.join(appDir, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(appDir, "public"), { recursive: true });

// wipe stale packaging output + verify the Electron entry exists
const dist = path.join(__dirname, "..", "dist");
fs.rmSync(dist, { recursive: true, force: true });
const entry = path.join(__dirname, "..", "index.js");
if (!fs.existsSync(entry)) {
  console.error("✗ desktop/index.js is missing — run `git pull` inside the repo.");
  process.exit(1);
}

console.log("✓ Site bundled at desktop/app — run `npm run start` or `npm run dist`.");
