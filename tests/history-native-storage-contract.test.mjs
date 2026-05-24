import assert from "node:assert/strict";
import fs from "node:fs";

const nativeStorage = fs.readFileSync("src/history/nativeHistoryStorage.ts", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");
const workbench = fs.readFileSync("src/components/HistoryReportCenter.tsx", "utf8");

for (const command of [
  "initialize_history_database",
  "write_history_batch",
  "query_history_trend",
  "export_history_trend_csv",
]) {
  assert.match(nativeStorage, new RegExp(command), `native storage should invoke ${command}`);
}

assert.match(nativeStorage, /@tauri-apps\/api\/core/, "native storage should use Tauri invoke");
assert.match(nativeStorage, /@tauri-apps\/api\/path/, "native storage should resolve app data path");
assert.match(nativeStorage, /appDataDir/, "native storage should store SQLite under app data directory");
assert.match(nativeStorage, /buildHistoryPersistBatch/, "native storage should serialize app snapshots through shared batch builder");
assert.match(app, /persistSnapshotToNativeHistory/, "App should persist loaded snapshots to native SQLite");
assert.match(app, /historyDbPath/, "App should expose the active history SQLite path to the UI");
assert.match(workbench, /nativeDbPath/, "History center should display native SQLite path/status");
assert.match(workbench, /persistSnapshotToNativeHistory/, "History center write button should write to native SQLite when available");

console.log("history native storage contract ok");
