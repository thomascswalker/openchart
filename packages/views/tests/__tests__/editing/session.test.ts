import { Midi } from "@openchart/midi";
import { describe, expect, it, vi } from "vitest";
import { ChartDocument } from "../../../src/editing/chartDocument.js";
import { EditingModeRegistry } from "../../../src/editing/modeRegistry.js";
import { createRawMidiMode } from "../../../src/editing/modes/rawMidi.js";
import {
  computePreview,
  createStandaloneEditing,
  createEditingSession,
  defaultConfig,
  Difficulty,
  EditRejectedError,
  formatNoteId,
  type ModeContext,
} from "../../../src/index.js";
import { SongView } from "../../../src/views/song.js";

function createMidi(withTrack = true): Midi {
  const midi = new Midi();
  if (withTrack) {
    const index = midi.addTrack();
    midi.tracks[index]!.name = "LEAD GUITAR";
    midi.tracks[index]!.addNote(60, 0, 90, 120);
  }
  return midi;
}

function createTarget(midi: Midi) {
  const trackIndex = midi.tracks.findIndex(
    (track) => track.name === "LEAD GUITAR",
  );
  return {
    trackKey: "lead-guitar",
    trackIndex: trackIndex < 0 ? null : trackIndex,
    difficulty: Difficulty.Expert,
  };
}

describe("standalone editing sessions", () => {
  it("resolves the first applicable mode in registration order", () => {
    const midi = createMidi();
    const descriptor = new SongView(midi)
      .getTrackDescriptors()
      .find((track) => track.key === "lead-guitar")!;
    const raw = createRawMidiMode();
    const preferred = { ...raw, id: "test.preferred", label: "Preferred" };
    const registry = new EditingModeRegistry();
    registry.register(preferred);
    registry.register(raw);

    expect(registry.resolve(descriptor, "piano-roll")).toBe(preferred);
    expect(registry.listForHost("piano-roll")).toEqual([preferred, raw]);
    expect(registry.canHost(descriptor, "piano-roll")).toBe(true);
    expect(registry.resolve(descriptor, "highway")).toBeNull();
  });

  it("keeps mode expansion, projections, classification, and previews pure", () => {
    const midi = createMidi();
    const standalone = createStandaloneEditing(midi);
    const session = standalone.createSession(createTarget(midi), "piano-roll");
    const descriptor = new SongView(midi)
      .getTrackDescriptors()
      .find((track) => track.key === "lead-guitar")!;
    const noteId = formatNoteId(
      0,
      midi.tracks[0]!.getEventId(midi.tracks[0]!.getNotes()[0]!.noteOn),
    );
    const projection = session.getProjection();
    expect(
      projection.rowForNote({
        id: noteId,
        trackIndex: 0,
        tick: 0,
        pitch: 60,
        duration: 120,
        velocity: 90,
      }),
    ).not.toBeNull();
    const documentBytes = midi.toBuffer();
    const document = new ChartDocument(midi);
    const context: ModeContext = {
      reader: document,
      target: session.target,
      config: defaultConfig,
    };
    const command = {
      type: "MOVE_NOTES" as const,
      targetIds: [noteId],
      tickDelta: 120,
      pitchDelta: 2,
    };

    expect(
      session.mode.expand(command, context, session.getToolState()),
    ).toMatchObject({
      commands: [command],
      rejections: [],
    });
    expect(projection.getRows()).toHaveLength(128);
    expect(projection.pitchForRow(projection.getRows()[60]!, {})).toBe(60);
    expect(
      session.mode.classify(document.getNote(noteId)!, context),
    ).toMatchObject({
      kind: "note",
      movable: true,
      resizable: true,
    });
    expect(session.classifyNote(document.getNote(noteId)!)).toMatchObject({
      kind: "note",
      movable: true,
      resizable: true,
    });
    expect(
      computePreview([command], document).updated.get(noteId),
    ).toMatchObject({
      tick: 120,
      pitch: 62,
    });
    expect(descriptor.key).toBe("lead-guitar");
    expect(midi.toBuffer()).toEqual(documentBytes);
  });

  it("cancels gestures without changing MIDI, history, or dirty state", () => {
    const midi = createMidi();
    const standalone = createStandaloneEditing(midi);
    const session = standalone.createSession(createTarget(midi), "piano-roll");
    const id = formatNoteId(
      0,
      midi.tracks[0]!.getEventId(midi.tracks[0]!.getNotes()[0]!.noteOn),
    );
    session.execute({
      type: "MOVE_NOTES",
      targetIds: [id],
      tickDelta: 120,
      pitchDelta: 1,
    });
    expect(standalone.history.undo()).toBe(true);
    const before = midi.toBuffer();
    const gesture = session.beginGesture();

    expect(
      gesture
        .preview({
          type: "MOVE_NOTES",
          targetIds: [id],
          tickDelta: 120,
          pitchDelta: 2,
        })
        .updated.get(id),
    ).toMatchObject({ tick: 120, pitch: 62 });
    expect(midi.toBuffer()).toEqual(before);
    expect(standalone.history.undoDepth).toBe(0);
    expect(standalone.history.redoDepth).toBe(1);
    expect(standalone.history.isDirty).toBe(false);

    gesture.cancel();

    expect(gesture.isOpen).toBe(false);
    expect(midi.toBuffer()).toEqual(before);
    expect(standalone.history.undoDepth).toBe(0);
    expect(standalone.history.redoDepth).toBe(1);
    expect(standalone.history.isDirty).toBe(false);
  });

  it("commits changed gestures once and keeps no-op commits out of history", () => {
    const midi = createMidi();
    const standalone = createStandaloneEditing(midi);
    const session = standalone.createSession(createTarget(midi), "piano-roll");
    const id = formatNoteId(
      0,
      midi.tracks[0]!.getEventId(midi.tracks[0]!.getNotes()[0]!.noteOn),
    );
    const gesture = session.beginGesture();
    gesture.preview({
      type: "MOVE_NOTES",
      targetIds: [id],
      tickDelta: 120,
      pitchDelta: 2,
    });

    expect(gesture.commit()).toMatchObject({ changed: true, updatedIds: [id] });
    expect(standalone.history.undoDepth).toBe(1);
    expect(midi.tracks[0]!.getNotes()[0]).toMatchObject({
      start: 120,
      pitch: 62,
    });

    expect(standalone.history.undo()).toBe(true);
    expect(midi.tracks[0]!.getNotes()[0]).toMatchObject({
      start: 0,
      pitch: 60,
    });
    expect(standalone.history.isDirty).toBe(false);

    const noOp = session.beginGesture();
    noOp.preview({
      type: "MOVE_NOTES",
      targetIds: [id],
      tickDelta: 0,
      pitchDelta: 0,
    });
    expect(noOp.commit().changed).toBe(false);
    expect(standalone.history.undoDepth).toBe(0);
  });

  it("does not misreport a committed edit if post-commit notification fails", () => {
    const midi = createMidi();
    const standalone = createStandaloneEditing(midi);
    const target = createTarget(midi);
    const descriptor = new SongView(midi)
      .getTrackDescriptors()
      .find((track) => track.key === target.trackKey)!;
    const mode = standalone.registry.resolve(descriptor, "piano-roll")!;
    const session = createEditingSession({
      document: new ChartDocument(midi),
      mode,
      target,
      hostKind: "piano-roll",
      config: defaultConfig,
      transaction: standalone.history,
      onCommit: () => {
        throw new Error("notification failed");
      },
    });
    const id = formatNoteId(
      0,
      midi.tracks[0]!.getEventId(midi.tracks[0]!.getNotes()[0]!.noteOn),
    );

    expect(() =>
      session.execute({
        type: "MOVE_NOTES",
        targetIds: [id],
        tickDelta: 120,
        pitchDelta: 1,
      }),
    ).toThrow("notification failed");
    expect(midi.tracks[0]!.getNotes()[0]).toMatchObject({
      start: 120,
      pitch: 61,
    });
    expect(standalone.history.undoDepth).toBe(1);
  });

  it("rolls back partially applied batches and reports a rejected edit", () => {
    const midi = createMidi();
    const standalone = createStandaloneEditing(midi);
    const session = standalone.createSession(createTarget(midi), "piano-roll");
    const track = midi.tracks[0]!;
    const before = midi.toBuffer();
    const insertNote = track.insertNote.bind(track);
    let calls = 0;
    vi.spyOn(track, "insertNote").mockImplementation((spec) => {
      calls += 1;
      if (calls === 2) throw new Error("simulated insertion failure");
      return insertNote(spec);
    });

    expect(() =>
      session.executeBatch([
        {
          type: "ADD_NOTES",
          notes: [
            { trackIndex: 0, tick: 240, pitch: 64, duration: 120 },
            { trackIndex: 0, tick: 480, pitch: 67, duration: 120 },
          ],
        },
      ]),
    ).toThrow(EditRejectedError);
    expect(midi.toBuffer()).toEqual(before);
    expect(standalone.history.undoDepth).toBe(0);
  });

  it("creates a missing configured track only for an accepted note insertion", () => {
    const midi = createMidi(false);
    const otherTrackIndex = midi.addTrack();
    midi.tracks[otherTrackIndex]!.name = "PART VOCALS";
    const standalone = createStandaloneEditing(midi);
    const session = standalone.createSession(createTarget(midi), "piano-roll");
    const result = session.execute({
      type: "ADD_NOTES",
      notes: [{ trackIndex: 0, tick: 120, pitch: 65, duration: 120 }],
    });

    expect(result.changed).toBe(true);
    expect(session.target.trackIndex).toBe(1);
    expect(midi.tracks[1]?.name).toBe("LEAD GUITAR");
    expect(midi.tracks[1]?.getNotes()).toHaveLength(1);
    expect(standalone.history.undo()).toBe(true);
    expect(midi.tracks).toHaveLength(1);
    expect(midi.tracks[0]?.name).toBe("PART VOCALS");
  });

  it("rejects commands outside mode capabilities without mutation", () => {
    const midi = createMidi();
    const standalone = createStandaloneEditing(midi);
    const session = standalone.createSession(createTarget(midi), "piano-roll");
    const before = midi.toBuffer();
    const result = session.execute({
      type: "SET_TEMPO",
      tick: 0,
      microsecondsPerQuarterNote: 500_000,
    });

    expect(result).toMatchObject({
      changed: false,
      rejections: [{ code: "unsupported-command" }],
    });
    expect(midi.toBuffer()).toEqual(before);
    expect(() =>
      session.execute(
        {
          type: "SET_TEMPO",
          tick: 0,
          microsecondsPerQuarterNote: 500_000,
        },
        { throwOnReject: true },
      ),
    ).toThrow(EditRejectedError);
  });
});
