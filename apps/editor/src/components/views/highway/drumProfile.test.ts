import { describe, expect, it } from "vitest";
import { getDrumNoteProfile, getDrumPitchForPlacement } from "./drumProfile";

describe("drum note profile", () => {
  it.each([60, 72, 84, 96])("maps all slots at offset %i", (offset) => {
    expect(
      Array.from({ length: 9 }, (_, slot) =>
        getDrumNoteProfile(offset + slot, offset),
      ),
    ).toEqual([
      { kind: "kick", lane: null, slot: 0 },
      { kind: "pad", lane: 0, slot: 1 },
      { kind: "pad", lane: 1, slot: 2 },
      { kind: "pad", lane: 2, slot: 3 },
      { kind: "pad", lane: 3, slot: 4 },
      { kind: "cymbal", lane: 1, slot: 5 },
      { kind: "cymbal", lane: 2, slot: 6 },
      { kind: "cymbal", lane: 3, slot: 7 },
      { kind: "marker", lane: null, slot: 8 },
    ]);
  });

  it("includes Expert Kick2 without changing its source pitch", () => {
    expect(getDrumNoteProfile(95, 96)).toEqual({
      kind: "kick",
      lane: null,
      slot: -1,
    });
    expect(getDrumNoteProfile(95, 84)).toBeNull();
  });

  it("rejects unsupported slots and invalid placement lanes", () => {
    expect(getDrumNoteProfile(59, 60)).toBeNull();
    expect(getDrumNoteProfile(69, 60)).toBeNull();
    expect(getDrumPitchForPlacement("kick", 4, 96)).toBeNull();
    expect(getDrumPitchForPlacement("pad", 4, 96)).toBeNull();
    expect(getDrumPitchForPlacement("cymbal", 0, 96)).toBeNull();
  });

  it("writes the selected drum kind at its valid physical lane", () => {
    expect(getDrumPitchForPlacement("kick", 3, 96)).toBe(96);
    expect(getDrumPitchForPlacement("pad", 3, 96)).toBe(100);
    expect(getDrumPitchForPlacement("cymbal", 1, 96)).toBe(101);
    expect(getDrumPitchForPlacement("cymbal", 3, 96)).toBe(103);
  });
});
