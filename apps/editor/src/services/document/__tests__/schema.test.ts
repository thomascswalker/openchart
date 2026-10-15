import { describe, expect, it } from "vitest";
import { makeDefaultMetadata, metadataSchema } from "../schema";

describe("makeDefaultMetadata", () => {
  it("populates defaults for every nested metadata object", () => {
    expect(makeDefaultMetadata()).toMatchObject({
      song: { name: "" },
      chart: { author: "" },
      difficulty: { band: 1 },
      audio: { song: null },
      credits: { publisher: "" },
    });
  });
});

describe("audio file metadata", () => {
  it("marks audio paths as files and validates WAV extensions", () => {
    const fileSchema = metadataSchema.shape.audio.shape.song;

    expect(fileSchema.meta()?.file).toBe(true);
    expect(fileSchema.safeParse("track.wav").success).toBe(true);
    expect(fileSchema.safeParse(null).success).toBe(true);
    expect(fileSchema.safeParse("track.mp3").success).toBe(false);
  });
});
