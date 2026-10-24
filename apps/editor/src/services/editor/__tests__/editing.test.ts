import { Midi } from "@openchart/midi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentService } from "../../document";
import type { LoggerService } from "../../logger";
import { EditorEditingService } from "../editing";

function createDocumentService(): DocumentService {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  } as unknown as LoggerService;
  return new DocumentService(logger);
}

describe("EditorEditingService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes commands through document history and keeps note selection across undo snapshots", () => {
    const documentService = createDocumentService();
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.addNote(60, 0, 100, 120);
    documentService.data = midi;
    const editing = new EditorEditingService(documentService);
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
    const editing = new EditorEditingService(documentService);
    const noteId = editing
      .getDocument()
      .getNoteId(0, midi.tracks[0]!.getNotes()[0]!);
    editing.selection.add(noteId);
    editing.scratchpad.set(noteId, { tickDelta: 120 });
    editing.clipboard.copy();
    expect(editing.clipboard.canPaste()).toBe(true);

    const nextMidi = new Midi();
    nextMidi.addTrack();
    documentService.data = nextMidi;

    expect(editing.selection.getSelectedIds()).toEqual([]);
    expect(editing.scratchpad.getSnapshot().size).toBe(0);
    expect(editing.clipboard.canPaste()).toBe(false);
  });
});
