/* Yetflix Neutralino builder.
 * 1. Reads the site URL (SITE_URL env or site-url.txt - default: localhost)
 * 2. Patches neutralino.config.json -> modes.window.url
 * 3. neu update (fetch runtime) + neu build --release
 * Output: dist/Yetflix/Yetflix-win_x64.exe (+ mac/linux binaries)          */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const cfgPath = path.join(HERE, "neutralino.config.json");

/*  resolve target URL  */
let url = (process.env.SITE_URL || "").trim();
if (!url) {
  const f = path.join(HERE, "site-url.txt");
  if (fs.existsSync(f)) url = fs.readFileSync(f, "utf8").trim();
}
if (!url || url.startsWith("REPLACE")) url = "http://localhost:3000/home";
if (!/^https?:\/\//.test(url)) url = "https://" + url;

console.log(">> Site URL:", url);

/*  patch config  */
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
cfg.modes.window.url = url;
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");

/*  make sure runtime binaries are present, then build  */
console.log(">> Fetching Neutralino runtime (first run only)...");
let r = spawnSync("npx", ["neu", "update"], { cwd: HERE, stdio: "inherit", shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

console.log(">> Building release binaries...");
r = spawnSync("npx", ["neu", "build", "--release"], { cwd: HERE, stdio: "inherit", shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);

console.log(`
[OK] Done - executables are in desktop-neutralino/dist/Yetflix/ :
    Yetflix-win_x64.exe     (Windows - uses WebView2, preinstalled on Win 10/11)
    Yetflix-macos_x64 / Yetflix-linux_x64 / arm builds (same folder)
  The app loads: ${url}
  Change it any time: edit desktop-neutralino/site-url.txt -> npm run build`);
