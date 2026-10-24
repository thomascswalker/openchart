import { MetaType, Midi } from "@openchart/midi";
import { describe, expect, it, vi } from "vitest";
import {
  ChartDocument,
  ClipboardService,
  computePreview,
  EditScratchpad,
  EditRejectedError,
  formatNoteId,
  formatTempoId,
  formatTextId,
  formatTimeSignatureId,
  parseEntityId,
  SelectionModel,
  TransactionManager,
  upgradeLegacyAction,
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
  it("formats and parses stable entity IDs", () => {
    expect(formatNoteId(0, "event-1")).toBe("note:0:event-1");
    expect(formatTextId(2, "event-2")).toBe("text:2:event-2");
    expect(formatTempoId("event-3")).toBe("tempo:event-3");
    expect(formatTimeSignatureId("event-4")).toBe("time-signature:event-4");
    expect(parseEntityId("note:0:event-1")).toEqual({
      kind: "note",
      trackIndex: 0,
      eventId: "event-1",
    });
    expect(parseEntityId("note:01:event-1")).toBeNull();
    expect(parseEntityId("phrase:0:event-1")).toBeNull();
    expect(() => formatNoteId(-1, "event-1")).toThrow(RangeError);
  });

  it("upgrades deprecated actions into the v2 raw vocabulary", () => {
    const context = {
      resolvePhrasePitch: () => 116,
      getNote: () => ({ tick: 480, pitch: 116, duration: 240 }),
    };
    expect(
      upgradeLegacyAction({
        type: "MOVE_NOTES",
        targetIds: ["note:0:event-1"],
        tickDelta: 120,
        trackDelta: 2,
      }),
    ).toEqual({
      type: "MOVE_NOTES",
      targetIds: ["note:0:event-1"],
      tickDelta: 120,
      pitchDelta: 2,
    });
    expect(
      upgradeLegacyAction(
        {
          type: "CREATE_PHRASE",
          trackIndex: 0,
          startTick: 480,
          duration: 240,
          phraseType: "stagepower",
        },
        context,
      ),
    ).toMatchObject({
      type: "ADD_NOTES",
      notes: [{ trackIndex: 0, tick: 480, pitch: 116, duration: 240 }],
    });
    expect(
      upgradeLegacyAction(
        {
          type: "RESIZE_PHRASE",
          targetId: "note:0:event-1",
          startDelta: 120,
          durationDelta: 60,
        },
        context,
      ),
    ).toMatchObject({
      type: "UPDATE_NOTES",
      patches: [{ id: "note:0:event-1", tick: 600, duration: 300 }],
    });
  });

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
        pitchDelta: 2,
      }),
    ).toMatchObject({ changed: true, updatedIds: [firstId] });
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
    ).toMatchObject({ changed: true, updatedIds: [firstId] });
    expect(document.getNote(firstId)?.duration).toBe(180);

    const secondId = document.getNoteId(0, second!);
    expect(
      document.apply({
        type: "DELETE_ENTITIES",
        targetIds: [secondId],
      }),
    ).toMatchObject({ changed: true, removedIds: [secondId] });
    expect(track.getNotes()).toHaveLength(1);
  });

  it("applies raw note creation and absolute updates with stable results", () => {
    const { document } = createDocument();
    const added = document.apply({
      type: "ADD_NOTES",
      notes: [
        { trackIndex: 0, tick: 480, pitch: 72, duration: 240, velocity: 88 },
      ],
    });
    expect(added).toMatchObject({
      changed: true,
      updatedIds: [],
      removedIds: [],
      rejections: [],
    });
    const id = added.createdIds[0]!;
    expect(parseEntityId(id)).toMatchObject({
      kind: "note",
      trackIndex: 0,
      eventId: expect.any(String),
    });

    expect(
      document.apply({
        type: "UPDATE_NOTES",
        patches: [{ id, tick: 600, pitch: 73, duration: 120, velocity: 99 }],
      }),
    ).toMatchObject({ changed: true, updatedIds: [id] });
    expect(document.getNote(id)).toMatchObject({
      tick: 600,
      pitch: 73,
      duration: 120,
      velocity: 99,
    });
  });

  it("preflights every batch command before changing MIDI", () => {
    const { midi, document } = createDocument();
    const before = midi.toBuffer();

    expect(() =>
      document.applyBatch([
        {
          type: "ADD_NOTES",
          notes: [{ trackIndex: 0, tick: 480, pitch: 72, duration: 120 }],
        },
        {
          type: "ADD_NOTES",
          notes: [{ trackIndex: 99, tick: 720, pitch: 76, duration: 120 }],
        },
      ]),
    ).toThrow(EditRejectedError);
    expect(midi.toBuffer()).toEqual(before);
  });

  it("applies text, tempo, and time-signature raw commands", () => {
    const { midi, document } = createDocument();
    const text = document.apply({
      type: "ADD_TEXT",
      trackIndex: 0,
      metaType: MetaType.Marker,
      tick: 120,
      text: "Verse",
    });
    const textId = text.createdIds[0]!;
    expect(document.getTextEvents(0)).toContainEqual({
      id: textId,
      tick: 120,
      text: "Verse",
      metaType: MetaType.Marker,
    });
    expect(
      document.apply({
        type: "UPDATE_TEXT",
        id: textId,
        tick: 240,
        text: "Chorus",
      }),
    ).toMatchObject({ changed: true, updatedIds: [textId] });
    expect(document.getTextEvents(0)).toContainEqual({
      id: textId,
      tick: 240,
      text: "Chorus",
      metaType: MetaType.Marker,
    });
    expect(
      document.apply({ type: "DELETE_ENTITIES", targetIds: [textId] }),
    ).toMatchObject({ changed: true, removedIds: [textId] });

    const tempo = document.apply({
      type: "SET_TEMPO",
      tick: 480,
      microsecondsPerQuarterNote: 500_000,
    });
    const tempoId = tempo.createdIds[0]!;
    expect(
      midi
        .getTempoEvents()
        .some(
          (event) =>
            event.tick === 480 && event.microsecondsPerQuarterNote === 500_000,
        ),
    ).toBe(true);
    expect(parseEntityId(tempoId)).toEqual({
      kind: "tempo",
      trackIndex: null,
      eventId: expect.any(String),
    });
    expect(
      document.apply({
        type: "SET_TEMPO",
        tick: 480,
        microsecondsPerQuarterNote: 400_000,
      }),
    ).toMatchObject({
      changed: true,
      createdIds: [expect.any(String)],
      removedIds: [tempoId],
    });
    expect(
      midi
        .getTempoEvents()
        .some(
          (event) =>
            event.tick === 480 && event.microsecondsPerQuarterNote === 400_000,
        ),
    ).toBe(true);
    expect(document.apply({ type: "REMOVE_TEMPO", tick: 480 })).toMatchObject({
      changed: true,
    });
    expect(
      document.apply({
        type: "SET_TIME_SIGNATURE",
        tick: 960,
        numerator: 3,
        denominator: 2,
      }),
    ).toMatchObject({ changed: true, createdIds: [expect.any(String)] });
    expect(
      midi
        .getTimeSignatureEvents()
        .some(
          (event) =>
            event.tick === 960 &&
            event.numerator === 3 &&
            event.denominator === 2,
        ),
    ).toBe(true);
    expect(
      document.apply({ type: "REMOVE_TIME_SIGNATURE", tick: 960 }),
    ).toMatchObject({ changed: true });
  });

  it("computes previews matching note command application", () => {
    const { midi, track, document } = createDocument();
    track.addNote(67, 480, 70, 240);
    const [first, second, third] = track.getNotes();
    const firstId = document.getNoteId(0, first!);
    const secondId = document.getNoteId(0, second!);
    const thirdId = document.getNoteId(0, third!);
    const commands = [
      {
        type: "UPDATE_NOTES" as const,
        patches: [{ id: firstId, tick: 120, pitch: 61 }],
      },
      {
        type: "ADD_NOTES" as const,
        notes: [{ trackIndex: 0, tick: 720, pitch: 72, duration: 120 }],
      },
      {
        type: "MOVE_NOTES" as const,
        targetIds: [secondId],
        tickDelta: 120,
        pitchDelta: -2,
      },
      { type: "DELETE_ENTITIES" as const, targetIds: [thirdId] },
    ];
    const preview = computePreview(commands, document);
    const before = midi.toBuffer();
    const appliedDocument = new ChartDocument(midi.clone(), () => null);
    const result = appliedDocument.applyBatch(commands);

    expect(preview.rejections).toEqual([]);
    expect(midi.toBuffer()).toEqual(before);
    expect(preview.removed).toEqual(new Set([thirdId]));
    expect([...preview.updated.keys()]).toEqual(
      expect.arrayContaining([firstId, secondId]),
    );
    for (const id of [firstId, secondId]) {
      expect(preview.updated.get(id)).toEqual(appliedDocument.getNote(id));
    }
    expect(preview.added).toHaveLength(1);
    expect(preview.added[0]).toMatchObject({
      ...appliedDocument.getNote(result.createdIds[0]!),
      id: "pending:0",
    });
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
        pitchDelta: 0,
      }),
    ).toMatchObject({ changed: true, updatedIds: [noteId] });
    expect(document.getNote(noteId)).toMatchObject({
      tick: 0,
      duration: 120,
    });
  });

  it("creates and resizes phrases through the same document", () => {
    const { track, document } = createDocument();

    expect(
      document.applyLegacy({
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
      document.applyLegacy({
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
      document.applyLegacy({
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
