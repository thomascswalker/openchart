import { DefaultCompiledRuleset, Difficulty } from "@openchart/views";
import { describe, expect, it } from "vitest";
import {
  getFiveFretNoteStyles,
  getTapSysExRanges,
  type GuitarNoteLike,
} from "../rendering/noteStyles";

function note(pitch: number, start: number, end = start): GuitarNoteLike {
  return { pitch: pitch, start, end };
}

describe("five-fret note styles", () => {
  it("keeps force markers registered for every guitar difficulty", () => {
    const expected = {
      expert: [103, 102, 101],
      hard: [91, 90, 89],
      medium: [79, 78, 77],
      easy: [67, 66, 65],
    };
    const difficulties = [
      Difficulty.Expert,
      Difficulty.Hard,
      Difficulty.Medium,
      Difficulty.Easy,
    ];
    for (const key of ["lead-guitar", "rhythm-guitar"]) {
      const track = DefaultCompiledRuleset.byKey.get(key);
      expect(track?.kind).toBe("guitar");
      if (!track) continue;
      difficulties.forEach((difficulty, index) => {
        const [tap, strum, hopo] = Object.values(expected)[index]!;
        const chart = track.difficulties.get(difficulty);
        expect(chart?.pitchForMarker("forceTap")).toBe(tap);
        expect(chart?.pitchForMarker("forceStrum")).toBe(strum);
        expect(chart?.pitchForMarker("forceHopo")).toBe(hopo);
      });
    }
  });

  it("classifies natural and forced HOPOs but not strums or chords", () => {
    const previous = note(96, 0);
    const natural = note(97, 160);
    const sameLane = note(97, 300);
    const forced = note(97, 310);
    const forcedStrum = note(97, 320);
    const chordA = note(98, 400);
    const chordB = note(99, 400);
    const afterChord = note(97, 500);
    const styles = getFiveFretNoteStyles(
      [
        previous,
        natural,
        sameLane,
        forced,
        forcedStrum,
        chordA,
        chordB,
        afterChord,
      ],
      [note(101, 310), note(102, 320)],
      {
        forceHopoPitch: 101,
        forceStrumPitch: 102,
        tapMarkerPitches: [103, 104],
        hopoThresholdTicks: 170,
        autoHopoExclusions: ["sameLaneAsPrevious", "chord"],
      },
    );

    expect(styles.get(natural)?.hopo).toBe(true);
    expect(styles.get(sameLane)?.hopo).toBe(false);
    expect(styles.get(forced)?.hopo).toBe(true);
    expect(styles.get(forcedStrum)?.hopo).toBe(false);
    expect(styles.get(chordA)?.hopo).toBe(false);
    expect(styles.get(chordB)?.hopo).toBe(false);
    expect(styles.get(afterChord)?.hopo).toBe(true);
  });

  it("marks notes inside tap-marker notes and tap SysEx phrases", () => {
    const markerTap = note(96, 10);
    const phraseTap = note(97, 30);
    const strum = note(98, 60);
    const sysexRanges = getTapSysExRanges([
      {
        deltaTime: 0,
        status: 0xf0,
        length: 4,
        data: new Uint8Array([0x50, 0, 1, 4]),
        tick: 20,
        order: 0,
      },
      {
        deltaTime: 0,
        status: 0xf0,
        length: 4,
        data: new Uint8Array([0x50, 0, 1, 4]),
        tick: 40,
        order: 1,
      },
    ]);
    const styles = getFiveFretNoteStyles(
      [markerTap, phraseTap, strum],
      [note(103, 10, 10)],
      { tapMarkerPitches: [103], tapSysExRanges: sysexRanges },
    );

    expect(styles.get(markerTap)?.tap).toBe(true);
    expect(styles.get(phraseTap)?.tap).toBe(true);
    expect(styles.get(strum)?.tap).toBe(false);
  });
});
