import { Midi } from "@openchart/midi";
import { MetaType } from "@openchart/midi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentService } from "../../document";
import type { LoggerService } from "../../logger";
import type { PlaybackService } from "../../playback";
import { EditingService } from "../editing";
import { ViewportService } from "../viewports";

function createDocumentService(): DocumentService {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  } as unknown as LoggerService;
  return new DocumentService(logger);
}

describe("EditingService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes commands through document history and keeps note selection across undo snapshots", () => {
    const documentService = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "LEAD GUITAR";
    midi.tracks[0]!.addNote(60, 0, 100, 120);
    documentService.data = midi;
    const playback = { refresh: vi.fn() } as unknown as PlaybackService;
    const editing = new EditingService(
      documentService,
      playback,
      new ViewportService(),
    );
    const noteId = editing
      .getDocument()
      .getNoteId(0, midi.tracks[0]!.getNotes()[0]!);

    editing.selection.add(noteId);
    const session = editing.getSession("viewport-1");
    expect(session).not.toBeNull();
    expect(
      session!.execute({
        type: "ADD_NOTES",
        notes: [{ trackIndex: 0, tick: 240, pitch: 64, duration: 120 }],
      }).changed,
    ).toBe(true);
    expect(playback.refresh).toHaveBeenCalledTimes(1);
    expect(documentService.getSnapshot().canUndo).toBe(true);
    expect(documentService.data.tracks[0]?.getNotes()).toHaveLength(2);

    documentService.undoEdit();

    expect(documentService.data.tracks[0]?.getNotes()).toHaveLength(1);
    expect(editing.selection.isSelected(noteId)).toBe(true);
    expect(editing.getDocument().getNote(noteId)).toMatchObject({
      tick: 0,
      pitch: 60,
    });
  });

  it("clears selection and clipboard when a new project is loaded", () => {
    const documentService = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.addNote(60, 0, 100, 120);
    documentService.data = midi;
    const editing = new EditingService(
      documentService,
      { refresh: vi.fn() } as unknown as PlaybackService,
      new ViewportService(),
    );
    const noteId = editing
      .getDocument()
      .getNoteId(0, midi.tracks[0]!.getNotes()[0]!);
    editing.selection.add(noteId);
    editing.clipboard.setData({
      sourceModeId: "midi.raw",
      entities: [
        {
          relativeTick: 0,
          duration: 100,
          velocity: 120,
          pitch: 60,
          classification: {
            kind: "note",
            subtype: "note",
            movable: true,
            resizable: true,
          },
        },
      ],
    });
    expect(editing.clipboard.canPaste()).toBe(true);

    const nextMidi = new Midi();
    nextMidi.addTrack();
    documentService.data = nextMidi;

    expect(editing.selection.getSelectedIds()).toEqual([]);
    expect(editing.clipboard.canPaste()).toBe(false);
  });

  it("commits a generic gesture in one undo step and refreshes playback", () => {
    const documentService = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "LEAD GUITAR";
    midi.tracks[0]!.addNote(60, 0, 100, 120);
    documentService.data = midi;
    const playback = { refresh: vi.fn() } as unknown as PlaybackService;
    const editing = new EditingService(
      documentService,
      playback,
      new ViewportService(),
    );
    const session = editing.getSession("viewport-1")!;
    const id = editing
      .getDocument()
      .getNoteId(0, midi.tracks[0]!.getNotes()[0]!);
    const gesture = session.beginGesture();
    gesture.preview({
      type: "MOVE_NOTES",
      targetIds: [id],
      tickDelta: 240,
      pitchDelta: 2,
    });

    expect(gesture.commit()).toMatchObject({ changed: true, updatedIds: [id] });
    expect(playback.refresh).toHaveBeenCalledTimes(1);
    expect(documentService.getSnapshot().canUndo).toBe(true);
    expect(documentService.data.tracks[0]?.getNotes()[0]).toMatchObject({
      start: 240,
      pitch: 62,
    });

    documentService.undoEdit();

    expect(documentService.data.tracks[0]?.getNotes()[0]).toMatchObject({
      start: 0,
      pitch: 60,
    });
    expect(documentService.getSnapshot().canUndo).toBe(false);
  });

  it("provides an isolated global header session for tempo and section edits", () => {
    const documentService = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "LEAD GUITAR";
    midi.addTempoEvent(0, 500_000);
    documentService.data = midi;
    const playback = { refresh: vi.fn() } as unknown as PlaybackService;
    const editing = new EditingService(
      documentService,
      playback,
      new ViewportService(),
    );

    const global = editing.getSession("viewport-1", "global");
    expect(global?.mode.id).toBe("midi.global");
    expect(global?.hostKind).toBe("global");
    expect(
      global?.execute({
        type: "SET_TEMPO",
        tick: 480,
        microsecondsPerQuarterNote: 400_000,
      }).changed,
    ).toBe(true);
    expect(
      global?.execute({
        type: "ADD_SECTION",
        tick: 960,
        name: "Verse",
      }).changed,
    ).toBe(true);
    expect(documentService.data.getTempoEvents()).toContainEqual(
      expect.objectContaining({
        tick: 480,
        microsecondsPerQuarterNote: 400_000,
      }),
    );
    expect(
      documentService.data.tracks[0]!.getTextEvents().some(
        (event) =>
          event.type === MetaType.Marker &&
          event.text === "[section Verse]" &&
          event.tick === 960,
      ),
    ).toBe(true);
    expect(playback.refresh).toHaveBeenCalledTimes(2);
  });

  it("rejects lyric mutations through the global session", () => {
    const documentService = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "VOCALS";
    const lyric = midi.tracks[0]!.addTextEvent(MetaType.Lyric, 0, "hello");
    documentService.data = midi;
    const editing = new EditingService(
      documentService,
      { refresh: vi.fn() } as unknown as PlaybackService,
      new ViewportService(),
    );
    const global = editing.getSession("viewport-1", "global")!;
    const lyricId = editing.getDocument().getTextEvents(0)[0]!.id;

    expect(
      global.execute({
        type: "DELETE_ENTITIES",
        targetIds: [lyricId],
      }).changed,
    ).toBe(false);
    expect(
      documentService.data.tracks[0]!.getTextEvents().some(
        (event) => event.type === MetaType.Lyric && event.text === lyric.text,
      ),
    ).toBe(true);
  });

  it("schema-validates and stores mode tool state per viewport", () => {
    const documentService = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "LEAD GUITAR";
    documentService.data = midi;
    const viewports = new ViewportService();
    const editing = new EditingService(
      documentService,
      { refresh: vi.fn() } as unknown as PlaybackService,
      viewports,
    );
    const active = viewports.getSnapshot().activeViewportId;
    const other = viewports.addViewport("piano-roll")!;

    editing.updateToolState(active, "vocals", {
      noteKind: "percussion",
    });
    expect(viewports.getViewport(active)?.tools.vocals).toEqual({
      noteKind: "percussion",
      phrase: null,
    });
    expect(() =>
      editing.updateToolState(active, "vocals", { noteKind: "invalid" }),
    ).toThrow();
    expect(viewports.getViewport(other)?.tools.vocals).toEqual({
      noteKind: "pitched",
      phrase: null,
    });
  });
});
