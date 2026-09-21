import { describe, expect, it } from "vitest";
import { getHighwayWheelTick, minimumMidiNoteDurationTicks } from "./interaction";

describe("highway interaction helpers", () => {
  it("uses the minimum valid MIDI duration for a click-created note", () => {
    expect(minimumMidiNoteDurationTicks).toBe(1);
  });

  it("moves the playhead in the corrected wheel direction", () => {
    expect(getHighwayWheelTick(480, 100, 480, 1 / 100)).toBe(0);
    expect(getHighwayWheelTick(480, -100, 480, 1 / 100)).toBe(960);
  });
});
