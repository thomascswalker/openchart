#!/usr/bin/env node
// Builds the static `latest.json` manifest consumed by tauri-plugin-updater
// from the signed bundles downloaded into a directory.
//
// Usage:
//   node apps/desktop/scripts/generate-latest-json.mjs \
//     --version 0.1.42 --tag build-<sha> --repo owner/name \
//     --assets release-assets --out release-assets/latest.json

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid arguments near "${key ?? ""}".`);
    }
    args[key.slice(2)] = value;
  }
  for (const required of ["version", "tag", "repo", "assets", "out"]) {
    if (!args[required]) throw new Error(`Missing --${required}.`);
  }
  return args;
}

function listFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function findSingle(files, predicate, description) {
  const matches = files.filter((file) => predicate(basename(file)));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${description}, found ${matches.length}: ${matches.join(", ") || "none"}`,
    );
  }
  return matches[0];
}

function platformEntry(files, bundle, repo, tag) {
  const signaturePath = `${bundle}.sig`;
  if (!files.includes(signaturePath)) {
    throw new Error(`Missing signature for ${basename(bundle)}.`);
  }
  const signature = readFileSync(signaturePath, "utf8").trim();
  if (!signature) throw new Error(`Empty signature: ${signaturePath}`);
  return {
    signature,
    url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(basename(bundle))}`,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const files = listFiles(args.assets);

  const appImage = findSingle(
    files,
    (name) => name.endsWith(".AppImage"),
    "AppImage bundle",
  );
  const nsis = findSingle(
    files,
    (name) => name.endsWith("-setup.exe"),
    "NSIS installer",
  );
  const msi = findSingle(
    files,
    (name) => name.endsWith(".msi"),
    "MSI installer",
  );

  const linux = platformEntry(files, appImage, args.repo, args.tag);
  const windowsNsis = platformEntry(files, nsis, args.repo, args.tag);
  const windowsMsi = platformEntry(files, msi, args.repo, args.tag);

  const manifest = {
    version: args.version,
    notes: `OpenChart Desktop ${args.tag}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "linux-x86_64": linux,
      "linux-x86_64-appimage": linux,
      "windows-x86_64": windowsNsis,
      "windows-x86_64-nsis": windowsNsis,
      "windows-x86_64-msi": windowsMsi,
    },
  };

  writeFileSync(args.out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${args.out} for version ${args.version}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
