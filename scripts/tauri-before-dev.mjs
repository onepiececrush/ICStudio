import http from "node:http";
import { spawn } from "node:child_process";
import { createNpmRunCommand } from "./tauri-dev-command.mjs";

const DEV_SERVER_URL = "http://localhost:1420/";
const REQUEST_TIMEOUT_MS = 1200;

async function isDevServerReady() {
  return new Promise((resolve) => {
    const request = http.get(DEV_SERVER_URL, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

if (await isDevServerReady()) {
  console.log(`[tauri-before-dev] Reusing existing Vite dev server at ${DEV_SERVER_URL}`);
  process.exit(0);
}

const { command, args } = createNpmRunCommand();
const child = spawn(command, args, {
  cwd: process.cwd(),
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
