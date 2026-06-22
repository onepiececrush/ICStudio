import assert from "node:assert/strict";
import fs from "node:fs";

const appCss = fs.readFileSync("src/App.css", "utf8");
const performanceCss = fs.existsSync("src/styles/performance.css")
  ? fs.readFileSync("src/styles/performance.css", "utf8")
  : "";

assert.match(appCss, /@import "\.\/styles\/performance\.css";/, "App should load performance animation overrides");
assert.match(performanceCss, /\.energy-line\s*\{[\s\S]*animation:\s*none\s*;/, "Energy lines should be static by default");
assert.match(
  performanceCss,
  /\.energy-flow-panel:has\(\.status-success\)\s+\.energy-line\s*\{[\s\S]*animation:\s*energy-flow/,
  "Energy flow animation should only run when the panel is connected/live",
);
assert.match(
  performanceCss,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
  "Motion-heavy UI should respect reduced-motion preference",
);

[
  "connection-pill.is-connected .status-dot",
  "frame-log-button.is-running::after",
  "simulator-live-banner.is-running .simulator-live-orb",
  "simulator-signal-wave",
].forEach((selector) => {
  assert.match(
    performanceCss,
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*animation:\\s*none\\s*!important`),
    `${selector} should stop animating in reduced-motion mode`,
  );
});

console.log("performance animation contract ok");
