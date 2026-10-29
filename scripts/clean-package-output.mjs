import { rm } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve(process.cwd(), process.argv[2] ?? "");
if (path.dirname(outputDirectory) !== process.cwd()) {
  throw new Error(
    "Provide a package output directory directly inside the package, for example: ./dist",
  );
}

await rm(outputDirectory, { recursive: true, force: true });
