import { Midi } from "@openchart/midi";
import { describe, expect, it } from "vitest";
import { DocumentService } from "../../services/document.js";
import { History } from "../History.js";

function createMidi(): Midi {
  const midi = new Midi();
  midi.addTrack();
  return midi;
}

describe("history transaction rollback", () => {
  it("restores the pre-transaction document without adding history", () => {
    const midi = createMidi();
    const history = new History();
    history.reset(midi);
    midi.tracks[0].addNote(60, 0, 100, 240);
    history.recordEdit(midi);

    history.beginTransaction();
    midi.tracks[0].addNote(62, 480, 100, 240);
    midi.addTrack();
    history.recordEdit(midi);
    const restored = history.rollbackTransaction()!;

    expect(restored.tracks).toHaveLength(1);
    expect(restored.tracks[0].getNotes().map((note) => note.note)).toEqual([
      60,
    ]);
    expect(history.isInTransaction).toBe(false);
    // Only the committed edit is undoable; the rolled-back one left nothing.
    expect(history.undo()!.tracks[0].getNotes()).toHaveLength(0);
    expect(history.canUndo).toBe(false);
  });

  it("returns null when no transaction is open", () => {
    const history = new History();
    history.reset(createMidi());
    expect(history.rollbackTransaction()).toBeNull();
  });

  it("replaces the document's MIDI and publishes on rollback", () => {
    const logger = { debug() {}, info() {}, warn() {}, error() {} };
    const document = new DocumentService(logger as never);
    let published = 0;
    document.subscribe(() => published++);
    const before = document.data!;

    document.beginEdit();
    before.addTrack();
    document.recordEdit();
    expect(document.rollbackEdit()).toBe(true);

    expect(document.data).not.toBe(before);
    expect(document.data!.tracks).toHaveLength(0);
    expect(document.getSnapshot().canUndo).toBe(false);
    expect(published).toBeGreaterThan(0);
    expect(document.rollbackEdit()).toBe(false);
  });
});
