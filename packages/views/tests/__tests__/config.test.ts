import { expect, test } from "vitest";
import { loadConfig } from "../../src/config.js";
import * as fs from "fs";
import path from "path";

test("load config from file", async () => {
  const filename = path.resolve("./configs/default.json");
  const content = fs.readFileSync(filename);
  const config = loadConfig(content.toString());
  expect(config).toBeDefined();
});
