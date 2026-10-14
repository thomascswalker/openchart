#!/usr/bin/env node
// Stamps a release version into tauri.conf.json and enables updater
// artifacts. Intended for CI only; local builds keep the committed config.
//
// Usage: node apps/desktop/scripts/prepare-release.mjs <major.minor.patch>

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `Expected a numeric semver version (e.g. 0.1.42), got: ${version ?? "<none>"}`,
  );
  process.exit(1);
}

const configPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src-tauri/tauri.conf.json",
);
const config = JSON.parse(readFileSync(configPath, "utf8"));

const previousVersion = config.version;
config.version = version;
config.bundle = { ...config.bundle, createUpdaterArtifacts: true };

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `tauri.conf.json: version ${previousVersion} -> ${version}, createUpdaterArtifacts = true`,
);
