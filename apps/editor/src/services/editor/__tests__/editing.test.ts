import { Midi } from "@openchart/midi";
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
    editing.scratchpad.set(noteId, { tickDelta: 120 });
    expect(
      editing.dispatch({
        type: "ADD_NOTE",
        trackIndex: 0,
        tick: 240,
        pitch: 64,
        duration: 120,
      }),
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
    expect(editing.scratchpad.get(noteId)).toEqual({ tickDelta: 120 });
  });

  it("clears document-scoped state and clipboard when a new project is loaded", () => {
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
    editing.scratchpad.set(noteId, { tickDelta: 120 });
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
    expect(editing.scratchpad.getSnapshot().size).toBe(0);
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
      note: 62,
    });

    documentService.undoEdit();

    expect(documentService.data.tracks[0]?.getNotes()[0]).toMatchObject({
      start: 0,
      note: 60,
    });
    expect(documentService.getSnapshot().canUndo).toBe(false);
  });
});
