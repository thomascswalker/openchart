import { Midi } from "@openchart/midi";
import { MetaType } from "@openchart/midi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentService } from "../../document";
import type { LoggerService } from "../../logger";
import type { PlaybackService } from "../../playback";
import { EditingService } from "../editing";
import { ViewportService } from "../viewports";
import { createTestRulesetService } from "../../__tests__/testUtils";
import {
  DomainCommandType,
  GeneralCommandType,
  EditingModeId,
  EntityType,
  VocalNoteKind,
} from "@openchart/views";

function createDocumentService(
  ruleset: ReturnType<typeof createTestRulesetService>,
): DocumentService {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  } as unknown as LoggerService;
  return new DocumentService(logger, ruleset);
}

describe("EditingService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes commands through document history and keeps note selection across undo snapshots", () => {
    const ruleset = createTestRulesetService();
    const documentService = createDocumentService(ruleset);
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "LEAD GUITAR";
    midi.tracks[0]!.addNote(60, 0, 100, 120);
    documentService.data = midi;
    const playback = { refresh: vi.fn() } as unknown as PlaybackService;
    const editing = new EditingService(
      documentService,
      playback,
      new ViewportService(ruleset),
      ruleset,
    );
    const noteId = editing
      .getCommandExecutor()
      ?.getNoteId(0, midi.tracks[0]!.getNotes()[0]!)!;

    const session = editing.getEditingSession("viewport-1");
    session?.selection.add(noteId);
    expect(session).not.toBeNull();
    expect(
      session!.execute({
        type: GeneralCommandType.AddNotes,
        notes: [{ trackIndex: 0, tick: 240, pitch: 64, duration: 120 }],
      }).changed,
    ).toBe(true);
    expect(playback.refresh).toHaveBeenCalledTimes(1);
    expect(documentService.getSnapshot().canUndo).toBe(true);
    expect(documentService.data.tracks[0]?.getNotes()).toHaveLength(2);

    documentService.undoEdit();

    expect(documentService.data.tracks[0]?.getNotes()).toHaveLength(1);
    expect(session?.selection.isSelected(noteId)).toBe(true);
    expect(editing.getCommandExecutor()?.getHandleFromId(noteId)).toMatchObject(
      {
        tick: 0,
        pitch: 60,
      },
    );
  });

  it("clears selection and clipboard when a new project is loaded", () => {
    const ruleset = createTestRulesetService();
    const documentService = createDocumentService(ruleset);
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.addNote(60, 0, 100, 120);
    documentService.data = midi;
    const editing = new EditingService(
      documentService,
      { refresh: vi.fn() } as unknown as PlaybackService,
      new ViewportService(ruleset),
      ruleset,
    );
    const session = editing.getEditingSession("viewport-1");
    const noteId = editing
      .getCommandExecutor()
      ?.getNoteId(0, midi.tracks[0]!.getNotes()[0]!)!;
    session?.selection.add(noteId);
    editing.clipboard.setData({
      sourceModeId: EditingModeId.MidiRaw,
      entities: [
        {
          relativeTick: 0,
          duration: 100,
          velocity: 120,
          pitch: 60,
          classification: {
            type: EntityType.Note,
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

    expect(session?.selection.getSelectedIds()).toEqual([]);
    expect(editing.clipboard.canPaste()).toBe(false);
  });

  it("commits a generic gesture in one undo step and refreshes playback", () => {
    const ruleset = createTestRulesetService();
    const documentService = createDocumentService(ruleset);
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "LEAD GUITAR";
    midi.tracks[0]!.addNote(60, 0, 100, 120);
    documentService.data = midi;
    const playback = { refresh: vi.fn() } as unknown as PlaybackService;
    const editing = new EditingService(
      documentService,
      playback,
      new ViewportService(ruleset),
      ruleset,
    );
    const session = editing.getEditingSession("viewport-1")!;
    const id = editing
      .getCommandExecutor()
      ?.getNoteId(0, midi.tracks[0]!.getNotes()[0]!);
    const gesture = session.beginGesture();
    gesture.preview({
      type: GeneralCommandType.MoveNotes,
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
    const ruleset = createTestRulesetService();
    const documentService = createDocumentService(ruleset);
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "GLOBAL";
    midi.addTrack();
    midi.tracks[1]!.name = "LEAD GUITAR";
    midi.addTempoEvent(0, 500_000);
    documentService.data = midi;
    const playback = { refresh: vi.fn() } as unknown as PlaybackService;
    const editing = new EditingService(
      documentService,
      playback,
      new ViewportService(ruleset),
      ruleset,
    );

    const global = editing.getEditingSession("viewport-1", "midi.global");
    expect(global?.mode.id).toBe(EditingModeId.MidiGlobal);
    expect(global?.hostKind).toBe("midi.global");
    expect(
      global?.execute({
        type: GeneralCommandType.SetTempo,
        tick: 480,
        microsecondsPerQuarterNote: 400_000,
      }).changed,
    ).toBe(true);
    expect(
      global?.execute({
        type: DomainCommandType.AddSection,
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
      documentService.data
        .getTrack("GLOBAL")!
        .getTextEvents()
        .some(
          (event) =>
            event.type === MetaType.Text &&
            event.text === "[section Verse]" &&
            event.tick === 960,
        ),
    ).toBe(true);
    expect(playback.refresh).toHaveBeenCalledTimes(2);
  });

  it("rejects lyric mutations through the global session", () => {
    const ruleset = createTestRulesetService();
    const documentService = createDocumentService(ruleset);
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "VOCALS";
    const lyric = midi.tracks[0]!.addTextEvent(MetaType.Lyric, 0, "hello");
    documentService.data = midi;
    const editing = new EditingService(
      documentService,
      { refresh: vi.fn() } as unknown as PlaybackService,
      new ViewportService(ruleset),
      ruleset,
    );
    const global = editing.getEditingSession("viewport-1", "midi.global")!;
    const lyricId = editing.getCommandExecutor()!.getTextEvents(0)[0]!.id!;

    expect(
      global.execute({
        type: GeneralCommandType.DeleteEntities,
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
    const ruleset = createTestRulesetService();
    const documentService = createDocumentService(ruleset);
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "LEAD GUITAR";
    documentService.data = midi;
    const viewports = new ViewportService(ruleset);
    const editing = new EditingService(
      documentService,
      { refresh: vi.fn() } as unknown as PlaybackService,
      viewports,
      ruleset,
    );
    const active = viewports.getSnapshot().activeViewportId;
    const other = viewports.addViewport("piano-roll")!;

    editing.updateToolState(active, EditingModeId.MidiVocals, {
      noteKind: VocalNoteKind.Percussion,
    });
    expect(
      viewports.getViewport(active)?.tools[EditingModeId.MidiVocals],
    ).toEqual({
      noteKind: VocalNoteKind.Percussion,
      phrase: null,
    });
    expect(() =>
      editing.updateToolState(active, EditingModeId.MidiVocals, {
        noteKind: "invalid",
      }),
    ).toThrow();
    expect(
      viewports.getViewport(other)?.tools[EditingModeId.MidiVocals],
    ).toEqual({
      noteKind: VocalNoteKind.Pitched,
      phrase: null,
    });
  });
});
