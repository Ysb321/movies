/* serves the standalone build (same bundle the desktop app uses) */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/* `next build` does NOT copy static assets/public into the standalone
 * output (desktop/scripts/prepare.js does it for the exe; do the same
 * here so the standalone server can actually serve chunks - otherwise
 * every /_next/static/* 404s and the page never hydrates). */
try {
  const standalone = path.join(__dirname, "..", ".next", "standalone");
  const staticSrc = path.join(__dirname, "..", ".next", "static");
  const staticDst = path.join(standalone, ".next", "static");
  if (fs.existsSync(staticSrc)) fs.cpSync(staticSrc, staticDst, { recursive: true });
  const publicSrc = path.join(__dirname, "..", "public");
  const publicDst = path.join(standalone, "public");
  if (fs.existsSync(publicSrc)) fs.cpSync(publicSrc, publicDst, { recursive: true });
} catch (e) {
  console.error("standalone sync failed:", e.message);
}

const server = spawn(process.execPath, [".next/standalone/server.js"], {
  env: { ...process.env, PORT: process.env.PORT || "3000", HOSTNAME: process.env.HOSTNAME || "0.0.0.0" },
  stdio: "inherit",
});
server.on("exit", (c) => process.exit(c ?? 0));
