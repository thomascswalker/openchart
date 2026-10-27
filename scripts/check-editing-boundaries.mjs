import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowlistPath = path.join(
  root,
  "scripts",
  "editing-boundaries.allowlist.json",
);
const strict = process.argv.includes("--strict");

const documentMutators = [
  "addNote",
  "insertNote",
  "addNoteAtPitch",
  "removeNote",
  "setNoteStart",
  "setNotePitch",
  "setNoteDuration",
  "updateNote",
  "addTextEvent",
  "updateTextEvent",
  "moveEvent",
  "removeEvent",
  "insertEventsAt",
  "insertEventAt",
  "updateEvent",
  "updateEventAt",
  "moveEventById",
  "removeEventById",
  "addTempoEvent",
  "addTimeSignatureEvent",
  "removeTempoEventAt",
  "removeTimeSignatureEventAt",
  "addNotePhrase",
  "updateNotePhrase",
  "removeNotePhrase",
  "moveNote",
  "setNoteEnd",
  "ensureMidiTrack",
  "ensureTrack",
];

const domainMutators = [
  "addNotePhrase",
  "updateNotePhrase",
  "removeNotePhrase",
  "addVocalNote",
  "moveVocalNotes",
  "removeVocalNotes",
  "setVocalLyric",
  "addVocalPhrase",
  "updateVocalPhrase",
  "repairVocalTrack",
];

const excludedDirectoryNames = new Set(["__tests__", ".storybook"]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectoryNames.has(entry.name)) {
        files.push(...walk(path.join(directory, entry.name)));
      }
    } else if (
      sourceExtensions.has(path.extname(entry.name)) &&
      !/\.test\.[^.]+$/.test(entry.name)
    ) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function relativePath(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function collectMatches(source, pattern, description, filePath, violations) {
  for (const match of source.matchAll(pattern)) {
    violations.push({
      file: filePath,
      line: lineAt(source, match.index ?? 0),
      rule: description,
      text: match[0].trim(),
    });
  }
}

function scanComponent(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const violations = [];
  const methods = new RegExp(`\\.(${documentMutators.join("|")})\\s*\\(`, "g");
  collectMatches(source, methods, "document mutation", filePath, violations);

  const bareCalls = new RegExp(
    `(?<![\\w$.])(${domainMutators.join("|")})\\s*\\(`,
    "g",
  );
  for (const match of source.matchAll(bareCalls)) {
    const offset = match.index ?? 0;
    if (/\bfunction\s+$/.test(source.slice(Math.max(0, offset - 16), offset))) {
      continue;
    }
    violations.push({
      file: filePath,
      line: lineAt(source, offset),
      rule: "domain mutation",
      text: match[0].trim(),
    });
  }
  return violations;
}

function scanPackage(filePath, packageRoot) {
  const source = fs.readFileSync(filePath, "utf8");
  const violations = [];
  const imports =
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(imports)) {
    const specifier = match[1] ?? match[2];
    if (specifier === "react" || specifier.startsWith("react/")) {
      violations.push({
        file: filePath,
        line: lineAt(source, match.index ?? 0),
        rule: "packages/views imports react",
        text: specifier,
      });
    }
    if (specifier === "three" || specifier.startsWith("three/")) {
      violations.push({
        file: filePath,
        line: lineAt(source, match.index ?? 0),
        rule: "packages/views imports three",
        text: specifier,
      });
    }
    if (specifier.startsWith(".")) {
      const resolved = path.resolve(path.dirname(filePath), specifier);
      const relative = path.relative(packageRoot, resolved);
      if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
        violations.push({
          file: filePath,
          line: lineAt(source, match.index ?? 0),
          rule: "relative import leaves packages/views",
          text: specifier,
        });
      }
    }
  }
  return violations;
}

const componentRoot = path.join(root, "apps", "editor", "src", "components");
const viewsRoot = path.join(root, "packages", "views");
const viewsSourceRoot = path.join(viewsRoot, "src");
const violations = [
  ...walk(componentRoot).flatMap(scanComponent),
  ...walk(viewsSourceRoot).flatMap((filePath) =>
    scanPackage(filePath, viewsRoot),
  ),
];

const entityIdPattern = /(["'`])(?:note:|text:|tempo:)/g;
const specialPitchPattern = new RegExp(
  `(?:\\b(?:pitch|note|offset)\\b[^\\r\\n]{0,48}\\b(?:95|101|102|103|104|116|118)\\b|\\b(?:95|101|102|103|104|116|118)\\b[^\\r\\n]{0,48}\\b(?:pitch|note|offset)\\b)`,
  "g",
);
for (const filePath of walk(componentRoot)) {
  const source = fs.readFileSync(filePath, "utf8");
  collectMatches(
    source,
    entityIdPattern,
    "entity id literal",
    filePath,
    violations,
  );
  collectMatches(
    source,
    specialPitchPattern,
    "special pitch literal",
    filePath,
    violations,
  );
}

const allowances = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const counts = new Map();
for (const violation of violations) {
  const file = relativePath(violation.file);
  counts.set(file, (counts.get(file) ?? 0) + 1);
  console.log(
    `${file}:${violation.line}: ${violation.rule}: ${violation.text}`,
  );
}

console.log(`Editing boundary violations: ${violations.length}`);
for (const [file, count] of [...counts].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  const allowance = Object.hasOwn(allowances, file)
    ? allowances[file]
    : "not allowlisted";
  console.log(`  ${file}: ${count} (allowance: ${allowance})`);
}

if (
  strict &&
  [...counts].some(
    ([file, count]) =>
      !Object.hasOwn(allowances, file) || count > allowances[file],
  )
) {
  process.exitCode = 1;
}
