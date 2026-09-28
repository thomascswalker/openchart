import { describe, expect, it } from "vitest";
import { getTimelinePosition } from "./timelinePosition";

const tempoChanges = [{ tick: 0, microsecondsPerQuarterNote: 500_000 }];

describe("timeline position", () => {
  it("formats tick, elapsed time, and the first measure", () => {
    expect(getTimelinePosition(0, 480, tempoChanges, [])).toEqual({
      tick: "0",
      time: "00:00:00.00",
      measure: "1.1.00",
    });
  });

  it("formats quarter-beat fractions and measure boundaries", () => {
    expect(getTimelinePosition(720, 480, tempoChanges, [])).toEqual({
      tick: "720",
      time: "00:00:00.75",
      measure: "1.2.50",
    });
    expect(getTimelinePosition(1920, 480, tempoChanges, [])).toEqual({
      tick: "1920",
      time: "00:00:02.00",
      measure: "2.1.00",
    });
  });

  it("uses time-signature changes when numbering measures", () => {
    expect(
      getTimelinePosition(2400, 480, tempoChanges, [
        { tick: 1920, numerator: 3, denominator: 2 },
      ]).measure,
    ).toBe("2.2.00");
  });
});
