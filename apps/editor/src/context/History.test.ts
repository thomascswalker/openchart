import { Midi } from "@midiedit/core";
import { describe, expect, it } from "vitest";
import { History } from "./History.js";

function createMidi(): Midi {
  const midi = new Midi();
  midi.addTrack();
  return midi;
}

describe("MIDI history", () => {
  it("undoes and redoes MIDI edits from shared snapshots", () => {
    const midi = createMidi();
    const history = new History();
    history.reset(midi);

    midi.tracks[0].addNote(60, 0, 100, 240);
    history.recordEdit(midi);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    const undone = history.undo()!;
    expect(undone.tracks[0].getNotes()).toHaveLength(0);
    const redone = history.redo()!;
    expect(redone.tracks[0].getNotes()).toHaveLength(1);
  });

  it("commits a transaction once and discards redo after a branch", () => {
    const midi = createMidi();
    const history = new History();
    history.reset(midi);

    history.beginTransaction();
    midi.tracks[0].addNote(60, 0, 100, 120);
    history.recordEdit(midi);
    midi.tracks[0].addNote(62, 120, 100, 120);
    history.recordEdit(midi);
    expect(history.endTransaction(midi)).toBe(true);
    expect(history.undo()!.tracks[0].getNotes()).toHaveLength(0);

    midi.tracks[0].addNote(64, 0, 100, 120);
    history.recordEdit(midi);
    expect(history.canRedo).toBe(false);
    expect(history.undo()!.tracks[0].getNotes()).toHaveLength(0);
  });

  it("trims retained edits to the configured capacity", () => {
    const midi = createMidi();
    const history = new History(2);
    history.reset(midi);

    for (const pitch of [60, 62, 64]) {
      midi.tracks[0].addNote(pitch, 120, 100, 120);
      history.recordEdit(midi);
    }

    expect(history.undo()!.tracks[0].getNotes()).toHaveLength(2);
    expect(history.undo()!.tracks[0].getNotes()).toHaveLength(1);
    expect(history.canUndo).toBe(false);
  });

  it("shrinks the retained history while keeping the nearest undo step", () => {
    const midi = createMidi();
    const history = new History(3);
    history.reset(midi);

    for (const pitch of [60, 62, 64]) {
      midi.tracks[0].addNote(pitch, 120, 100, 120);
      history.recordEdit(midi);
    }
    history.setCapacity(1);

    expect(history.undo()!.tracks[0].getNotes()).toHaveLength(2);
    expect(history.canUndo).toBe(false);
  });

  it("resets history and validates capacity", () => {
    const midi = createMidi();
    const history = new History();
    history.reset(midi);
    midi.tracks[0].addNote(60, 0, 100, 120);
    history.recordEdit(midi);

    history.reset(createMidi());

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(() => history.setCapacity(0)).toThrow(RangeError);
    expect(() => history.setCapacity(1025)).toThrow(RangeError);
  });
});
