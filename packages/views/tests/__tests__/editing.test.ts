import { Midi } from "@openchart/midi";
import { describe, expect, it, vi } from "vitest";
import {
  ChartDocument,
  ClipboardService,
  EditScratchpad,
  SelectionModel,
  TransactionManager,
} from "../../src/index.js";

function createDocument() {
  const midi = new Midi();
  const trackIndex = midi.addTrack();
  const track = midi.tracks[trackIndex]!;
  track.name = "LEAD GUITAR";
  track.addNote(60, 0, 90, 120);
  const secondNoteTick = 240;
  const secondNoteInsertAt = track.getInsertionIndexAt(secondNoteTick);
  track.addNote(
    64,
    secondNoteTick - track.getAbsoluteTickAt(secondNoteInsertAt),
    80,
    240,
    secondNoteInsertAt,
  );
  const document = new ChartDocument(midi, (index, kind) =>
    index === 0 && kind === "stagepower" ? 116 : null,
  );
  return { midi, track, document };
}

describe("shared chart editing primitives", () => {
  it("applies serializable note commands and resolves note IDs", () => {
    const { midi, track, document } = createDocument();
    const [first, second] = track.getNotes();
    const firstId = document.getNoteId(0, first!);

    const clonedDocument = new ChartDocument(midi.clone(), (index, kind) =>
      index === 0 && kind === "stagepower" ? 116 : null,
    );
    expect(clonedDocument.getNote(firstId)).toMatchObject({
      tick: 0,
      pitch: 60,
    });
    expect(document.getNote(firstId)).toMatchObject({
      trackIndex: 0,
      tick: 0,
      pitch: 60,
      duration: 120,
      velocity: 90,
    });
    expect(
      document.apply({
        type: "MOVE_NOTES",
        targetIds: [firstId],
        tickDelta: 120,
        trackDelta: 2,
      }),
    ).toBe(true);
    expect(document.getNote(firstId)).toMatchObject({
      tick: 120,
      pitch: 62,
    });
    expect(
      document.apply({
        type: "RESIZE_NOTES",
        targetIds: [firstId],
        durationDelta: 60,
      }),
    ).toBe(true);
    expect(document.getNote(firstId)?.duration).toBe(180);

    const secondId = document.getNoteId(0, second!);
    expect(
      document.apply({
        type: "DELETE_SELECTION",
        targetIds: [secondId],
      }),
    ).toBe(true);
    expect(track.getNotes()).toHaveLength(1);
  });

  it("preserves duration when a note move clamps at tick zero", () => {
    const midi = new Midi();
    const trackIndex = midi.addTrack();
    const track = midi.tracks[trackIndex]!;
    track.addNote(60, 60, 90, 120);
    const document = new ChartDocument(midi, () => null);
    const noteId = document.getNoteId(0, track.getNotes()[0]!);

    expect(
      document.apply({
        type: "MOVE_NOTES",
        targetIds: [noteId],
        tickDelta: -120,
        trackDelta: 0,
      }),
    ).toBe(true);
    expect(document.getNote(noteId)).toMatchObject({
      tick: 0,
      duration: 120,
    });
  });

  it("creates and resizes phrases through the same document", () => {
    const { track, document } = createDocument();

    expect(
      document.apply({
        type: "CREATE_PHRASE",
        trackIndex: 0,
        startTick: 480,
        duration: 240,
        phraseType: "stagepower",
      }),
    ).toBe(true);
    const phrase = track.getNotes().find((note) => note.note === 116)!;
    const phraseId = document.getNoteId(0, phrase);
    expect(document.getNote(phraseId)).toMatchObject({
      tick: 480,
      pitch: 116,
      duration: 240,
    });
    expect(
      document.apply({
        type: "RESIZE_PHRASE",
        targetId: phraseId,
        startDelta: 120,
        durationDelta: 120,
      }),
    ).toBe(true);
    expect(document.getNote(phraseId)).toMatchObject({
      tick: 600,
      duration: 360,
    });

    const regularNoteId = document.getNoteId(0, track.getNotes()[0]!);
    expect(
      document.apply({
        type: "RESIZE_PHRASE",
        targetId: regularNoteId,
        startDelta: 120,
        durationDelta: 120,
      }),
    ).toBe(false);
  });

  it("shares ID-based selection changes and keeps drag previews volatile", () => {
    const selection = new SelectionModel();
    const listener = vi.fn();
    const unsubscribe = selection.subscribe(listener);

    selection.setSelectedIds(["note:0:event-1", "phrase:0:event-2"]);
    selection.add("note:0:event-1");
    expect(selection.getSelectedIds()).toEqual([
      "note:0:event-1",
      "phrase:0:event-2",
    ]);
    expect(selection.getRevision()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();

    const scratchpad = new EditScratchpad();
    const scratchListener = vi.fn();
    scratchpad.subscribe(scratchListener);
    scratchpad.set("note:0:event-1", { tickDelta: 120, trackDelta: 1 });
    expect(scratchpad.get("note:0:event-1")).toEqual({
      tickDelta: 120,
      trackDelta: 1,
    });
    scratchpad.clear();
    expect(scratchpad.getSnapshot().size).toBe(0);
    expect(scratchListener).toHaveBeenCalledTimes(2);
  });

  it("copies selected notes and produces paste commands", () => {
    const { track, document } = createDocument();
    const selection = new SelectionModel();
    const ids = track.getNotes().map((note) => document.getNoteId(0, note));
    selection.setSelectedIds(ids);
    const clipboard = new ClipboardService(document, selection);

    expect(clipboard.copy().notes).toHaveLength(2);
    expect(clipboard.createPasteActions(960, 0)).toEqual([
      {
        type: "ADD_NOTE",
        trackIndex: 0,
        tick: 960,
        pitch: 60,
        duration: 120,
        velocity: 90,
      },
      {
        type: "ADD_NOTE",
        trackIndex: 0,
        tick: 1_200,
        pitch: 64,
        duration: 240,
        velocity: 80,
      },
    ]);
    const dispatchBatch = vi.fn(() => true);
    expect(clipboard.paste(960, 0, dispatchBatch)).toBe(true);
    expect(dispatchBatch).toHaveBeenCalledOnce();
    expect(dispatchBatch).toHaveBeenCalledWith(
      clipboard.createPasteActions(960, 0),
    );
  });

  it("records successful commands and groups batches as one transaction", () => {
    const { document } = createDocument();
    const transaction = {
      beginEdit: vi.fn(),
      recordEdit: vi.fn(),
      endEdit: vi.fn(),
    };
    const manager = new TransactionManager(document, transaction);
    const action = {
      type: "ADD_NOTE" as const,
      trackIndex: 0,
      tick: 480,
      pitch: 72,
      duration: 120,
    };

    expect(manager.dispatch(action)).toBe(true);
    expect(transaction.recordEdit).toHaveBeenCalledTimes(1);
    expect(
      manager.dispatchBatch([
        { ...action, tick: 720 },
        { ...action, tick: 960 },
      ]),
    ).toBe(true);
    expect(transaction.beginEdit).toHaveBeenCalledTimes(1);
    expect(transaction.recordEdit).toHaveBeenCalledTimes(3);
    expect(transaction.endEdit).toHaveBeenCalledTimes(1);
  });
});
