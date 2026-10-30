import { MetaType, Midi } from "@openchart/midi";
import { describe, expect, it, vi } from "vitest";
import { Difficulty } from "../../ruleset/difficulty.js";
import { GeneralCommandType, DomainCommandType } from "../commands.js";
import {
  formatNoteId,
  formatTextId,
  formatTempoId,
  formatTimeSignatureId,
  parseEntityId,
} from "../entity.js";
import { CommandExecutor } from "../executor.js";
import { computePreview } from "../preview.js";
import { EditRejectedError } from "../result.js";
import { SelectionModel } from "../selection.js";
import { createStandaloneEditing } from "../standalone.js";

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
  const executor = new CommandExecutor(midi);
  return { midi, track, executor };
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
    const { midi, track, executor } = createDocument();
    const [first, second] = track.getNotes();
    const firstId = executor.getNoteId(0, first!);

    const clonedExecutor = new CommandExecutor(midi.clone());
    expect(clonedExecutor.getHandleFromId(firstId)).toMatchObject({
      tick: 0,
      pitch: 60,
    });
    expect(executor.getHandleFromId(firstId)).toMatchObject({
      trackIndex: 0,
      tick: 0,
      pitch: 60,
      duration: 120,
      velocity: 90,
    });
    expect(
      executor.apply({
        type: GeneralCommandType.MoveNotes,
        targetIds: [firstId],
        tickDelta: 120,
        pitchDelta: 2,
      }),
    ).toMatchObject({ changed: true, updatedIds: [firstId] });
    expect(executor.getHandleFromId(firstId)).toMatchObject({
      tick: 120,
      pitch: 62,
    });
    expect(
      executor.apply({
        type: GeneralCommandType.ResizeNotes,
        targetIds: [firstId],
        durationDelta: 60,
      }),
    ).toMatchObject({ changed: true, updatedIds: [firstId] });
    expect(executor.getHandleFromId(firstId)?.duration).toBe(180);

    const secondId = executor.getNoteId(0, second!);
    expect(
      executor.apply({
        type: GeneralCommandType.DeleteEntities,
        targetIds: [secondId],
      }),
    ).toMatchObject({ changed: true, removedIds: [secondId] });
    expect(track.getNotes()).toHaveLength(1);
  });

  it("applies raw note creation and absolute updates with stable results", () => {
    const { executor } = createDocument();
    const added = executor.apply({
      type: GeneralCommandType.AddNotes,
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
      executor.apply({
        type: GeneralCommandType.UpdateNotes,
        patches: [{ id, tick: 600, pitch: 73, duration: 120, velocity: 99 }],
      }),
    ).toMatchObject({ changed: true, updatedIds: [id] });
    expect(executor.getHandleFromId(id)).toMatchObject({
      tick: 600,
      pitch: 73,
      duration: 120,
      velocity: 99,
    });
  });

  it("preflights every batch command before changing MIDI", () => {
    const { midi, executor } = createDocument();
    const before = midi.toBuffer();

    expect(() =>
      executor.applyBatch([
        {
          type: GeneralCommandType.AddNotes,
          notes: [{ trackIndex: 0, tick: 480, pitch: 72, duration: 120 }],
        },
        {
          type: GeneralCommandType.AddNotes,
          notes: [{ trackIndex: 99, tick: 720, pitch: 76, duration: 120 }],
        },
      ]),
    ).toThrow(EditRejectedError);
    expect(midi.toBuffer()).toEqual(before);
  });

  it("applies text, tempo, and time-signature raw commands", () => {
    const { midi, executor } = createDocument();
    const text = executor.apply({
      type: GeneralCommandType.AddText,
      trackIndex: 0,
      metaType: MetaType.Marker,
      tick: 120,
      text: "Verse",
    });
    const textId = text.createdIds[0]!;
    expect(executor.getTextEvents(0)).toContainEqual({
      id: textId,
      tick: 120,
      text: "Verse",
      metaType: MetaType.Marker,
    });
    expect(
      executor.apply({
        type: GeneralCommandType.UpdateText,
        id: textId,
        tick: 240,
        text: "Chorus",
      }),
    ).toMatchObject({ changed: true, updatedIds: [textId] });
    expect(executor.getTextEvents(0)).toContainEqual({
      id: textId,
      tick: 240,
      text: "Chorus",
      metaType: MetaType.Marker,
    });
    expect(
      executor.apply({
        type: GeneralCommandType.DeleteEntities,
        targetIds: [textId],
      }),
    ).toMatchObject({ changed: true, removedIds: [textId] });

    const tempo = executor.apply({
      type: GeneralCommandType.SetTempo,
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
      executor.apply({
        type: GeneralCommandType.SetTempo,
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
      executor.apply({ type: GeneralCommandType.RemoveTempo, tick: 480 }),
    ).toMatchObject({
      changed: true,
    });
    expect(
      executor.apply({
        type: GeneralCommandType.SetTimeSignature,
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
      executor.apply({
        type: GeneralCommandType.RemoveTimeSignature,
        tick: 960,
      }),
    ).toMatchObject({ changed: true });
  });

  it("computes previews matching note command application", () => {
    const { midi, track, executor } = createDocument();
    track.addNote(67, 480, 70, 240);
    const [first, second, third] = track.getNotes();
    const firstId = executor.getNoteId(0, first!);
    const secondId = executor.getNoteId(0, second!);
    const thirdId = executor.getNoteId(0, third!);
    const commands = [
      {
        type: GeneralCommandType.UpdateNotes as const,
        patches: [{ id: firstId, tick: 120, pitch: 61 }],
      },
      {
        type: GeneralCommandType.AddNotes as const,
        notes: [{ trackIndex: 0, tick: 720, pitch: 72, duration: 120 }],
      },
      {
        type: GeneralCommandType.MoveNotes as const,
        targetIds: [secondId],
        tickDelta: 120,
        pitchDelta: -2,
      },
      {
        type: GeneralCommandType.DeleteEntities as const,
        targetIds: [thirdId],
      },
    ];
    const preview = computePreview(commands, executor);
    const before = midi.toBuffer();
    const appliedExecutor = new CommandExecutor(midi.clone());
    const result = appliedExecutor.applyBatch(commands);

    expect(preview.rejections).toEqual([]);
    expect(midi.toBuffer()).toEqual(before);
    expect(preview.removed).toEqual(new Set([thirdId]));
    expect([...preview.updated.keys()]).toEqual(
      expect.arrayContaining([firstId, secondId]),
    );
    for (const id of [firstId, secondId]) {
      expect(preview.updated.get(id)).toEqual(
        appliedExecutor.getHandleFromId(id),
      );
    }
    expect(preview.added).toHaveLength(1);
    expect(preview.added[0]).toMatchObject({
      ...appliedExecutor.getHandleFromId(result.createdIds[0]!),
      id: "pending:0",
    });
  });

  it("preserves duration when a note move clamps at tick zero", () => {
    const midi = new Midi();
    const trackIndex = midi.addTrack();
    const track = midi.tracks[trackIndex]!;
    track.addNote(60, 60, 90, 120);
    const executor = new CommandExecutor(midi);
    const noteId = executor.getNoteId(0, track.getNotes()[0]!);

    expect(
      executor.apply({
        type: GeneralCommandType.MoveNotes,
        targetIds: [noteId],
        tickDelta: -120,
        pitchDelta: 0,
      }),
    ).toMatchObject({ changed: true, updatedIds: [noteId] });
    expect(executor.getHandleFromId(noteId)).toMatchObject({
      tick: 0,
      duration: 120,
    });
  });

  it("moves a note group through one stable session command", () => {
    const midi = new Midi();
    const track = midi.tracks[midi.addTrack()]!;
    track.addNote(96, 0, 100, 120);
    track.addNote(97, 240, 100, 120);
    const executor = new CommandExecutor(midi);
    const targetIds = track
      .getNotes()
      .map((note) => executor.getNoteId(0, note));

    expect(
      executor.apply({
        type: GeneralCommandType.MoveNotes,
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
    const { midi, track, executor } = createDocument();
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
    const phraseId = executor.getNoteId(0, phrase);
    expect(executor.getHandleFromId(phraseId)).toMatchObject({
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
    expect(executor.getHandleFromId(phraseId)).toMatchObject({
      tick: 600,
      duration: 360,
    });

    const regularNoteId = executor.getNoteId(0, track.getNotes()[0]!);
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
    const executor = new CommandExecutor(midi);
    const noteId = executor.getNoteId(0, note);
    const before = midi.toBuffer();
    const preview = computePreview(
      [
        {
          type: GeneralCommandType.MoveNotes,
          targetIds: [noteId],
          tickDelta: 120,
          pitchDelta: 1,
        },
      ],
      executor,
    );

    expect(preview.updated.get(noteId)).toMatchObject({
      tick: 120,
      pitch: 61,
    });
    expect(midi.toBuffer()).toEqual(before);
  });

  it("pastes mode-tagged clipboard notes in one session transaction", () => {
    const { midi, track, executor } = createDocument();
    const standalone = createStandaloneEditing(midi);
    const session = standalone.createSession(
      {
        trackKey: "lead-guitar",
        trackIndex: 0,
        difficulty: Difficulty.Expert,
      },
      "piano-roll",
    );
    const ids = track.getNotes().map((note) => executor.getNoteId(0, note));
    const selected = ids.map((id) => executor.getHandleFromId(id)!);
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
      type: GeneralCommandType.AddNotes as const,
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
