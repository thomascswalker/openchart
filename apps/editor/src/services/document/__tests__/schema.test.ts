import { describe, expect, it } from "vitest";
import { makeDefaultMetadata } from "../schema";

describe("makeDefaultMetadata", () => {
  it("populates defaults for every nested metadata object", () => {
    expect(makeDefaultMetadata()).toMatchObject({
      song: { name: "" },
      chart: { author: "" },
      difficulty: { band: 1 },
      audio: { song: "" },
      credits: { publisher: "" },
    });
  });
});
