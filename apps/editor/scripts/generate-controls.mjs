// Regenerates the keyboard section of /controls.md from src/input/*.
// Usage: npm run docs:controls   (requires Node >= 22.18 for TS type stripping)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderHotkeyTables } from "../src/input/controlsDoc.ts";
import { globalBindings } from "../src/input/global.ts";
import { highwayBindings } from "../src/input/highway.ts";
import { pianoRollBindings } from "../src/input/pianoroll.ts";

const START = "<!-- hotkeys:start -->";
const END = "<!-- hotkeys:end -->";
const target = fileURLToPath(new URL("../../../controls.md", import.meta.url));

const generated = renderHotkeyTables([
  ...globalBindings,
  ...highwayBindings,
  ...pianoRollBindings,
]);
const source = readFileSync(target, "utf8");
const start = source.indexOf(START);
const end = source.indexOf(END);
if (start < 0 || end < 0 || end < start) {
  throw new Error(`controls.md is missing the ${START} / ${END} markers.`);
}
const next = `${source.slice(0, start + START.length)}\n\n> Generated from \`apps/editor/src/input\` by \`npm run docs:controls\`. Edit the binding tables, not this block.\n\n${generated}\n\n${source.slice(end)}`;
writeFileSync(target, next);
console.log("Updated controls.md");
