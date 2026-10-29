import { MetaType, Midi } from "@openchart/midi";
import { describe, expect, it, vi } from "vitest";
import {
  DomainCommandType,
  EditCommandType,
  ChartDocument,
  computePreview,
  createStandaloneEditing,
  Difficulty,
  EditRejectedError,
  formatNoteId,
  formatTempoId,
  formatTextId,
  formatTimeSignatureId,
  parseEntityId,
  SelectionModel,
} from "../../index.js";

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
  const document = new ChartDocument(midi);
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

  it("applies serializable note commands and resolves note IDs", () => {
    const { midi, track, document } = createDocument();
    const [first, second] = track.getNotes();
    const firstId = document.getNoteId(0, first!);

    const clonedDocument = new ChartDocument(midi.clone());
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
        type: EditCommandType.MoveNotes,
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
        type: EditCommandType.ResizeNotes,
        targetIds: [firstId],
        durationDelta: 60,
      }),
    ).toMatchObject({ changed: true, updatedIds: [firstId] });
    expect(document.getNote(firstId)?.duration).toBe(180);

    const secondId = document.getNoteId(0, second!);
    expect(
      document.apply({
        type: EditCommandType.DeleteEntities,
        targetIds: [secondId],
      }),
    ).toMatchObject({ changed: true, removedIds: [secondId] });
    expect(track.getNotes()).toHaveLength(1);
  });

  it("applies raw note creation and absolute updates with stable results", () => {
    const { document } = createDocument();
    const added = document.apply({
      type: EditCommandType.AddNotes,
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
        type: EditCommandType.UpdateNotes,
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
          type: EditCommandType.AddNotes,
          notes: [{ trackIndex: 0, tick: 480, pitch: 72, duration: 120 }],
        },
        {
          type: EditCommandType.AddNotes,
          notes: [{ trackIndex: 99, tick: 720, pitch: 76, duration: 120 }],
        },
      ]),
    ).toThrow(EditRejectedError);
    expect(midi.toBuffer()).toEqual(before);
  });

  it("applies text, tempo, and time-signature raw commands", () => {
    const { midi, document } = createDocument();
    const text = document.apply({
      type: EditCommandType.AddText,
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
        type: EditCommandType.UpdateText,
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
      document.apply({
        type: EditCommandType.DeleteEntities,
        targetIds: [textId],
      }),
    ).toMatchObject({ changed: true, removedIds: [textId] });

    const tempo = document.apply({
      type: EditCommandType.SetTempo,
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
        type: EditCommandType.SetTempo,
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
    expect(
      document.apply({ type: EditCommandType.RemoveTempo, tick: 480 }),
    ).toMatchObject({
      changed: true,
    });
    expect(
      document.apply({
        type: EditCommandType.SetTimeSignature,
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
      document.apply({ type: EditCommandType.RemoveTimeSignature, tick: 960 }),
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
        type: EditCommandType.UpdateNotes as const,
        patches: [{ id: firstId, tick: 120, pitch: 61 }],
      },
      {
        type: EditCommandType.AddNotes as const,
        notes: [{ trackIndex: 0, tick: 720, pitch: 72, duration: 120 }],
      },
      {
        type: EditCommandType.MoveNotes as const,
        targetIds: [secondId],
        tickDelta: 120,
        pitchDelta: -2,
      },
      { type: EditCommandType.DeleteEntities as const, targetIds: [thirdId] },
    ];
    const preview = computePreview(commands, document);
    const before = midi.toBuffer();
    const appliedDocument = new ChartDocument(midi.clone());
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
    const document = new ChartDocument(midi);
    const noteId = document.getNoteId(0, track.getNotes()[0]!);

    expect(
      document.apply({
        type: EditCommandType.MoveNotes,
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

  it("moves a note group through one stable session command", () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.addNote(96, 0, 100, 120);
    track.addNote(97, 240, 100, 120);
    const document = new ChartDocument(midi);
    const targetIds = track
      .getNotes()
      .map((note) => document.getNoteId(0, note));

    expect(
      document.apply({
        type: EditCommandType.MoveNotes,
        targetIds,
        tickDelta: 480,
        pitchDelta: 2,
      }).changed,
    ).toBe(true);
    expect(
      track.getNotes().map((note) => [note.pitch, note.start, note.end]),
    ).toEqual([
      [98, 480, 600],
      [99, 840, 960],
    ]);
  });

  it("creates and resizes phrases through a mode session", () => {
    const { midi, track, document } = createDocument();
    const session = createStandaloneEditing(midi).createSession(
      {
        trackKey: "lead-guitar",
        trackIndex: 0,
        difficulty: Difficulty.Expert,
      },
      "highway",
    );

    expect(
      session.execute({
        type: DomainCommandType.CreatePhrase,
        phraseId: "stagePower",
        startTick: 480,
        endTick: 720,
      }).changed,
    ).toBe(true);
    const phrase = track.getNotes().find((note) => note.pitch === 116)!;
    const phraseId = document.getNoteId(0, phrase);
    expect(document.getNote(phraseId)).toMatchObject({
      tick: 480,
      pitch: 116,
      duration: 240,
    });
    expect(
      session.execute({
        type: DomainCommandType.UpdatePhrase,
        id: phraseId,
        startTick: 600,
        endTick: 960,
      }).changed,
    ).toBe(true);
    expect(document.getNote(phraseId)).toMatchObject({
      tick: 600,
      duration: 360,
    });

    const regularNoteId = document.getNoteId(0, track.getNotes()[0]!);
    const rejected = session.execute({
      type: DomainCommandType.UpdatePhrase,
      id: regularNoteId,
      startTick: 120,
      endTick: 360,
    });
    expect(rejected.changed).toBe(false);
    expect(rejected.rejections).toHaveLength(1);
  });

  it("shares ID-based selection changes and keeps previews volatile", () => {
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

    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    const note = track.addNote(60, 0, 90, 120);
    const document = new ChartDocument(midi);
    const noteId = document.getNoteId(0, note);
    const before = midi.toBuffer();
    const preview = computePreview(
      [
        {
          type: EditCommandType.MoveNotes,
          targetIds: [noteId],
          tickDelta: 120,
          pitchDelta: 1,
        },
      ],
      document,
    );

    expect(preview.updated.get(noteId)).toMatchObject({
      tick: 120,
      pitch: 61,
    });
    expect(midi.toBuffer()).toEqual(before);
  });

  it("pastes mode-tagged clipboard notes in one session transaction", () => {
    const { midi, track, document } = createDocument();
    const standalone = createStandaloneEditing(midi);
    const session = standalone.createSession(
      {
        trackKey: "lead-guitar",
        trackIndex: 0,
        difficulty: Difficulty.Expert,
      },
      "piano-roll",
    );
    const ids = track.getNotes().map((note) => document.getNoteId(0, note));
    const selected = ids.map((id) => document.getNote(id)!);
    const firstTick = Math.min(...selected.map((note) => note.tick));
    standalone.clipboard.setData({
      sourceModeId: session.mode.id,
      entities: selected.map((note) => {
        const row = session.getProjection().rowForNote(note);
        return {
          relativeTick: note.tick - firstTick,
          duration: note.duration,
          velocity: note.velocity,
          pitch: note.pitch,
          ...(row ? { row: row.id } : {}),
          classification: session.classifyNote(note),
        };
      }),
    });

    const result = session.pasteClipboard(960);

    expect(result.changed).toBe(true);
    expect(result.createdIds).toHaveLength(2);
    expect(
      track.getNotes().map(({ start, pitch, end, velocity }) => ({
        tick: start,
        pitch,
        duration: end - start,
        velocity,
      })),
    ).toEqual([
      { tick: 0, pitch: 60, duration: 120, velocity: 90 },
      { tick: 240, pitch: 64, duration: 240, velocity: 80 },
      { tick: 960, pitch: 60, duration: 120, velocity: 90 },
      { tick: 1_200, pitch: 64, duration: 240, velocity: 80 },
    ]);
    expect(standalone.history.undoDepth).toBe(1);
  });

  it("records commands and batches as separate session history entries", () => {
    const { midi, track } = createDocument();
    const standalone = createStandaloneEditing(midi);
    const session = standalone.createSession(
      {
        trackKey: "lead-guitar",
        trackIndex: 0,
        difficulty: Difficulty.Expert,
      },
      "piano-roll",
    );
    const add = (tick: number) => ({
      type: EditCommandType.AddNotes as const,
      notes: [{ trackIndex: 0, tick, pitch: 72, duration: 120 }],
    });

    expect(session.execute(add(480)).changed).toBe(true);
    expect(standalone.history.undoDepth).toBe(1);
    expect(session.executeBatch([add(720), add(960)]).changed).toBe(true);
    expect(standalone.history.undoDepth).toBe(2);
    expect(track.getNotes()).toHaveLength(5);
    expect(standalone.history.undo()).toBe(true);
    expect(midi.tracks[0]!.getNotes()).toHaveLength(3);
  });
});
