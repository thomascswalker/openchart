import { expect, test } from "vitest";
import { Difficulty } from "../../src/types.js";
import {
  defaultConfig,
  describeTrack,
  getDifficultyName,
  getDifficultyNotePitch,
  getTrackRole,
  loadConfig,
  SongViewSchema,
} from "../../src/config.js";
import * as fs from "fs";
import path from "path";

test("load config from file", async () => {
  const filename = path.resolve("./configs/default.json");
  const content = fs.readFileSync(filename);
  const parsedContent = content.toString();
  const config = loadConfig(parsedContent);
  expect(SongViewSchema.parse(JSON.parse(parsedContent))).toEqual(config);
  expect(config).toBeDefined();
});

test("resolves semantic roles and difficulty note pitches from config", () => {
  const tracks = defaultConfig.tracks.map(describeTrack);
  const lead = tracks.find((track) => track.name === "LEAD GUITAR")!;
  const drums = tracks.find((track) => track.name === "DRUMS")!;

  expect(getTrackRole(drums)).toBe("drums");
  expect(getTrackRole(lead)).toBe("lead");
  expect(getDifficultyName(Difficulty.Easy)).toBe("easy");
  expect(getDifficultyName(Difficulty.Medium)).toBe("medium");
  expect(getDifficultyName(Difficulty.Hard)).toBe("hard");
  expect(getDifficultyName(Difficulty.Expert)).toBe("expert");
  expect(getDifficultyNotePitch(lead, Difficulty.Expert, "Hopo")).toBe(101);
  expect(getDifficultyNotePitch(drums, Difficulty.Expert, "Kick2")).toBe(95);
  expect(getDifficultyNotePitch(lead, Difficulty.Expert, "Kick2")).toBeNull();
});
