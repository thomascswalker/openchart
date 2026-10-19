import { describe, expect, it } from "vitest";
import { makeDefaultMetadata, MetadataSchema } from "../schema";

describe("makeDefaultMetadata", () => {
  it("populates defaults for every nested metadata object", () => {
    expect(makeDefaultMetadata()).toMatchObject({
      song: { name: "" },
      chart: { author: "" },
      difficulty: { band: 1 },
      audio: { root: null, song: null },
      credits: { publisher: "" },
    });
  });
});

describe("audio file metadata", () => {
  it("marks audio paths as files and validates WAV extensions", () => {
    const fileSchema = MetadataSchema.shape.audio.shape.song;

    expect(fileSchema.meta()?.file).toBe(true);
    expect(fileSchema.safeParse("track.wav").success).toBe(true);
    expect(fileSchema.safeParse(null).success).toBe(true);
    expect(fileSchema.safeParse("track.mp3").success).toBe(false);
  });

  it("marks the audio root as a directory path and accepts legacy metadata", () => {
    const rootSchema = MetadataSchema.shape.audio.shape.root;
    const legacy = makeDefaultMetadata() as Record<string, unknown>;
    const audio = legacy.audio as Record<string, unknown>;
    delete audio.root;

    expect(rootSchema.meta()?.directory).toBe(true);
    expect(MetadataSchema.parse(legacy).audio.root).toBeNull();
  });
});
