import { MetaType, MidiTrack, type MidiNote } from "@openchart/midi";
import { addVocalNote, addVocalPhrase, getLyrics } from "@openchart/views";
import { describe, expect, it, vi } from "vitest";
import characterization from "../../../../../../../packages/views/tests/fixtures/characterization/editing.json" with { type: "json" };
import { VocalEditingStrategy } from "../vocalEditing";
import { profileForInstrument } from "../profile";
import type { MoveTarget, ResizeTarget } from "../editingStrategy";
import type { CoordinateSystem } from "../coordinates";
import type { PianoRollContext, PianoRollNote } from "../types";

const profile = profileForInstrument("VOCALS");
const layout = profile.vocal!;

function pianoNote(note: MidiNote): PianoRollNote {
  return {
    tick: note.start,
    durationTicks: note.end - note.start,
    pitch: note.note,
    velocity: note.velocity,
    midiNote: note,
  };
}

function moveTarget(note: MidiNote): MoveTarget {
  return {
    note: pianoNote(note),
    initialTick: note.start,
    initialPitch: note.note,
  };
}

describe("editing characterization: Piano Roll vocals", () => {
  it("records lyric-preserving moves, lane locking, phrase constraints, delete, and paste", () => {
    const track = new MidiTrack("VOCALS");
    const pitched = addVocalNote(track, layout, "pitched", 0, 120, {
      pitch: characterization.vocal.pitchedMove.fromPitch,
      lyric: characterization.vocal.pasteRestoresLyric,
    })!.note;
    const laneNote = addVocalNote(track, layout, "percussion", 240, 360)!.note;
    const context = {
      getProfile: () => profile,
      getSelectedTrack: () => track,
      getPpqn: () => 480,
      previewNotes: vi.fn(),
    } as unknown as PianoRollContext;
    const strategy = new VocalEditingStrategy(context, {} as CoordinateSystem);
    const pitchedTarget = moveTarget(pitched);

    strategy.beginMove([pitchedTarget]);
    strategy.move(
      [pitchedTarget],
      characterization.vocal.pitchedMove.toTick,
      characterization.vocal.pitchedMove.toPitch -
        characterization.vocal.pitchedMove.fromPitch,
    );
    expect([pitched.start, pitched.note]).toEqual([
      characterization.vocal.pitchedMove.toTick,
      characterization.vocal.pitchedMove.clampedPitch,
    ]);
    expect(getLyrics(track).map((lyric) => lyric.tick)).toEqual(
      characterization.vocal.lyricTicksAfterMove,
    );

    const laneTarget = moveTarget(laneNote);
    strategy.beginMove([laneTarget]);
    strategy.move(
      [laneTarget],
      0,
      characterization.vocal.nonPitchedMove.requestedPitch -
        characterization.vocal.nonPitchedMove.pitch,
    );
    expect(laneNote.note).toBe(
      characterization.vocal.nonPitchedMove.resultPitch,
    );

    const firstPhrase = addVocalPhrase(track, layout, "stagepower", 0, 100)!;
    addVocalPhrase(track, layout, "stagepower", 200, 300);
    const phraseTarget = moveTarget(firstPhrase.note);
    strategy.beginMove([phraseTarget]);
    strategy.move([phraseTarget], 50, 0);
    strategy.move(
      [phraseTarget],
      characterization.vocal.phraseMove.blockedDelta,
      0,
    );
    expect(firstPhrase.note.start).toBe(
      characterization.vocal.phraseMove.resultStart,
    );
    const resizeTarget: ResizeTarget = {
      note: pianoNote(firstPhrase.note),
      initialDuration: firstPhrase.note.end - firstPhrase.note.start,
    };
    expect(strategy.resize([resizeTarget], 150)).toBe(
      !characterization.vocal.phraseResizeRejected,
    );

    const clipboard = strategy.copy([pianoNote(pitched)]);
    expect(strategy.remove([pianoNote(pitched)])).toBe(
      characterization.vocal.deleteRemovesLyric,
    );
    expect(getLyrics(track).some((lyric) => lyric.tick === pitched.start)).toBe(
      false,
    );
    strategy.paste(clipboard, 960);
    expect(getLyrics(track).find((lyric) => lyric.tick === 960)?.text).toBe(
      characterization.vocal.pasteRestoresLyric,
    );
    expect(
      getLyrics(track).every((lyric) => lyric.type === MetaType.Lyric),
    ).toBe(true);
  });
});
