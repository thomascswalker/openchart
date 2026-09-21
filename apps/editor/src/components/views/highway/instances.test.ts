import { describe, expect, it } from "vitest";
import { visibleInstanceItems } from "./highwayInstances";

describe("highway visibility instanceing", () => {
  it("only returns notes intersecting the visible temporal window", () => {
    const notes = [
      { start: 0, end: 10 },
      { start: 20, end: 30 },
      { start: 40, end: 50 },
    ];
    expect(visibleInstanceItems(notes, 15, 35, 128)).toEqual([notes[1]]);
  });

  it("caps visible work at the instance capacity", () => {
    const notes = Array.from({ length: 4 }, (_, start) => ({
      start,
      end: start + 1,
    }));
    expect(visibleInstanceItems(notes, 0, 10, 2)).toHaveLength(2);
  });
});
