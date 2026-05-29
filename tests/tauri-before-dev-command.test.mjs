import assert from "node:assert/strict";
import { test } from "node:test";

import { createNpmRunCommand } from "../scripts/tauri-dev-command.mjs";

test("wraps npm run dev with cmd.exe on Windows", () => {
  const command = createNpmRunCommand("win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" });

  assert.deepEqual(command, {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "npm run dev"],
  });
});

test("uses npm directly outside Windows", () => {
  const command = createNpmRunCommand("linux", {});

  assert.deepEqual(command, {
    command: "npm",
    args: ["run", "dev"],
  });
});
