#!/usr/bin/env node
// Stamps a release version into tauri.conf.json and enables updater
// artifacts. Intended for CI only; local builds keep the committed config.
//
// Usage: node apps/desktop/scripts/prepare-release.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootPackagePath = resolve(scriptDirectory, "../../../package.json");
const { version } = JSON.parse(readFileSync(rootPackagePath, "utf8"));
if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version in root package.json: ${version ?? "<none>"}`);
  process.exit(1);
}

const configPath = resolve(scriptDirectory, "../src-tauri/tauri.conf.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

const previousVersion = config.version;
config.version = version;
config.bundle = { ...config.bundle, createUpdaterArtifacts: true };

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `tauri.conf.json: version ${previousVersion} -> ${version}, createUpdaterArtifacts = true`,
);
