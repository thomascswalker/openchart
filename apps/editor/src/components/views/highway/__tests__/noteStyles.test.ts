import type { TimedMidiEvent } from "@openchart/midi";
import { defaultConfig } from "@openchart/views";
import { describe, expect, it } from "vitest";
import {
  getFiveFretNoteStyles,
  getTapSysExRanges,
  type GuitarNoteLike,
} from "../noteStyles";

function note(pitch: number, start: number, end = start): GuitarNoteLike {
  return { note: pitch, start, end };
}

describe("five-fret note styles", () => {
  it("keeps force markers registered for every guitar difficulty", () => {
    const expected = {
      expert: [103, 102, 101],
      hard: [91, 90, 89],
      medium: [79, 78, 77],
      easy: [67, 66, 65],
    };
    for (const key of ["lead-guitar", "rhythm-guitar"]) {
      const config = defaultConfig.tracks.find((track) => track.key === key);
      expect(config?.type).toBe("instrument");
      if (config?.type !== "instrument") continue;
      for (const [difficulty, [tap, strum, hopo]] of Object.entries(expected)) {
        expect(config.notes[`${difficulty}Tap`]).toBe(tap);
        expect(config.notes[`${difficulty}Strum`]).toBe(strum);
        expect(config.notes[`${difficulty}Hopo`]).toBe(hopo);
      }
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
        ppqn: 480,
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
        event: { status: 0xf0, data: new Uint8Array([0x50, 0, 1, 4]) },
        tick: 20,
        order: 0,
      },
      {
        event: { status: 0xf0, data: new Uint8Array([0x50, 0, 1, 4]) },
        tick: 40,
        order: 1,
      },
    ] as TimedMidiEvent[]);
    const styles = getFiveFretNoteStyles(
      [markerTap, phraseTap, strum],
      [note(103, 10, 10)],
      { tapMarkerPitches: [103], ppqn: 480, tapSysExRanges: sysexRanges },
    );

    expect(styles.get(markerTap)?.tap).toBe(true);
    expect(styles.get(phraseTap)?.tap).toBe(true);
    expect(styles.get(strum)?.tap).toBe(false);
  });
});
