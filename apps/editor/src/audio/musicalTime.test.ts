import { describe, expect, it } from "vitest";
import { ticksToMs } from "@midiedit/core";
import {
  beatCrossings,
  tickToBeatPosition,
  tickWindowForLookAhead,
} from "./musicalTime";

describe("musical playback positions", () => {
  const tempoChanges = [
    { tick: 0, microsecondsPerQuarterNote: 500_000 },
    { tick: 960, microsecondsPerQuarterNote: 1_000_000 },
  ];
  const timeSignatures = [{ tick: 0, numerator: 4, denominator: 2 }];

  it("crosses beats using tempo-aware look-ahead", () => {
    const endTick = tickWindowForLookAhead(900, 100, 480, tempoChanges);
    expect(endTick).toBe(997.5);
    expect(beatCrossings(900, 960, 480,  timeSignatures)).toEqual([
      { tick: 960, measure: 0, beat: 2, isDownbeat: false },
    ]);
    expect(ticksToMs(endTick, 480, tempoChanges)).toBe(1_037.5);
  });

  it("starts a new downbeat at a time-signature change", () => {
    const changes = [
      { tick: 0, numerator: 4, denominator: 2 },
      { tick: 1_920, numerator: 3, denominator: 2 },
    ];
    expect(tickToBeatPosition(2_400, 480, changes)).toEqual({
      tick: 2_400,
      measure: 1,
      beat: 1,
      isDownbeat: false,
    });
    expect(beatCrossings(1_900, 2_400, 480, changes)).toEqual([
      { tick: 1_920, measure: 1, beat: 0, isDownbeat: true },
      { tick: 2_400, measure: 1, beat: 1, isDownbeat: false },
    ]);
  });
});
