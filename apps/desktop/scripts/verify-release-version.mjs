import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function parseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid package.json version: ${version}`);
  }
  return match.slice(1).map(BigInt);
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }
  return 0;
}

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const packageVersion = parseVersion(version);
const tags = execFileSync("git", ["tag", "--list", "v[0-9]*"], {
  encoding: "utf8",
})
  .trim()
  .split(/\r?\n/)
  .filter((tag) =>
    /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag),
  );

if (tags.length === 0) {
  console.log(
    `No prior vM.m.p release tags found; allowing initial version ${version}.`,
  );
  process.exit(0);
}

const latestTag = tags.reduce((latest, tag) =>
  compareVersions(parseVersion(tag.slice(1)), parseVersion(latest.slice(1))) > 0
    ? tag
    : latest,
);
const comparison = compareVersions(
  packageVersion,
  parseVersion(latestTag.slice(1)),
);

if (comparison <= 0) {
  throw new Error(
    `package.json version ${version} must be greater than the latest release tag ${latestTag}.`,
  );
}

console.log(
  `Version ${version} is newer than the latest release tag ${latestTag}.`,
);
