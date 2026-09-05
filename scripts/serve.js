/* serves the standalone build (same bundle the desktop app uses) */
const { spawn } = require("child_process");
const server = spawn(process.execPath, [".next/standalone/server.js"], {
  env: { ...process.env, PORT: process.env.PORT || "3000", HOSTNAME: process.env.HOSTNAME || "0.0.0.0" },
  stdio: "inherit",
});
server.on("exit", (c) => process.exit(c ?? 0));
