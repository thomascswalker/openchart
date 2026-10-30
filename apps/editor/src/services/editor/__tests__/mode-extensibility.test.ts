import { Midi } from "@openchart/midi";
import {
  GeneralCommandType,
  EntityType,
  SongView,
  type ClipboardPayload,
  AbstractEditingMode,
  type EditCommand,
  type EditingModeId,
  type EntityClassification,
  type ModeCapabilities,
  type ExpansionResult,
  type ModeContext,
  type NoteHandle,
  type Projection,
  type GeneralCommand,
} from "@openchart/views";
import { describe, expect, it, vi } from "vitest";
import { ContextStore } from "../../../platform/context";
import type { LoggerService } from "../../logger";
import type { PlaybackService } from "../../playback";
import { DocumentService } from "../../document";
import { createModeToolbarGroups } from "../../../components/editor/Toolbar/definitions";
import { createEditingContextSnapshot } from "../editingContext";
import { EditingService } from "../editing";
import { ViewportService } from "../viewports";
import { z } from "zod";
import { createTestRulesetService } from "../../__tests__/testUtils";

const lanes = ["green", "red", "yellow", "blue"] as const;
type FourLaneToolState = { lane: (typeof lanes)[number] };

class FourLaneMode extends AbstractEditingMode<FourLaneToolState> {
  public readonly id: EditingModeId = "test.fourLane";
  public readonly label = "Four Lane Test";
  public readonly hostKinds: ReadonlySet<string> = new Set(["test-view"]);
  public readonly capabilities: ModeCapabilities = {
    generalCommands: new Set([
      GeneralCommandType.AddNotes,
      GeneralCommandType.MoveNotes,
      GeneralCommandType.DeleteEntities,
    ]),
    domainCommands: new Set(),
    entityKinds: new Set([EntityType.Note]),
    canCreateTrack: false,
    requiresDifficulty: false,
    trackKinds: new Set(),
  };
  public readonly toolStateSchema = z.object({ lane: z.enum(lanes) });

  public appliesTo(): boolean {
    return true;
  }

  public createDefaultToolState(): FourLaneToolState {
    return { lane: "green" };
  }

  public createTools() {
    return lanes.map((lane) => ({
      id: `lane-${lane}`,
      label: `${lane[0]!.toUpperCase()}${lane.slice(1)} lane`,
      icon: "note",
      group: "four-lane-tools",
      stateKey: "lane",
      value: lane,
    }));
  }

  public createProjection(): Projection {
    return {
      getRows: () =>
        lanes.map((id, index) => ({
          id,
          label: `${id[0]!.toUpperCase()}${id.slice(1)}`,
          index,
          kind: "lane",
        })),
      rowForNote: (note: NoteHandle) =>
        lanes.map((id, index) => ({
          id,
          label: id,
          index,
          kind: "lane",
        }))[note.pitch % lanes.length] ?? null,
      pitchForRow: (row) =>
        60 + Math.max(0, lanes.indexOf(row.id as (typeof lanes)[number])),
    };
  }

  public classify(): EntityClassification {
    return {
      type: EntityType.Note,
      subtype: "four-lane",
      movable: true,
      resizable: true,
    };
  }

  public expandPaste(
    payload: ClipboardPayload,
    anchorTick: number,
    context: ModeContext,
  ): ExpansionResult {
    return {
      commands: [
        {
          type: GeneralCommandType.AddNotes,
          notes: payload.entities.map((entity) => ({
            trackIndex: context.target.trackIndex!,
            tick: anchorTick + entity.relativeTick,
            pitch: entity.pitch,
            duration: entity.duration,
            velocity: entity.velocity,
          })),
        },
      ],
      rejections: [],
    };
  }

  public expand(command: EditCommand): ExpansionResult {
    if (
      command.type === GeneralCommandType.AddNotes ||
      command.type === GeneralCommandType.MoveNotes ||
      command.type === GeneralCommandType.DeleteEntities
    ) {
      return { commands: [command as GeneralCommand], rejections: [] };
    }
    return this.rejected(
      command,
      "unsupported-command",
      "Unsupported by test.fourLane",
    );
  }

  public rejected(
    command: EditCommand,
    code: string,
    message: string,
  ): ExpansionResult {
    return { commands: [], rejections: [{ code, message, command }] };
  }
}
function createDocumentService(
  ruleset: ReturnType<typeof createTestRulesetService>,
): DocumentService {
  return new DocumentService(
    {
      debug: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    } as unknown as LoggerService,
    ruleset,
  );
}

describe("editing mode extensibility acceptance", () => {
  it("resolves, renders, publishes context, executes, pastes, and gestures a test mode", () => {
    const ruleset = createTestRulesetService();
    const documentService = createDocumentService(ruleset);
    const midi = new Midi();
    midi.addTrack();
    midi.tracks[0]!.name = "LEAD GUITAR";
    midi.tracks[0]!.addNote(60, 0, 100, 120);
    documentService.data = midi;
    const viewports = new ViewportService(ruleset);
    const editing = new EditingService(
      documentService,
      { refresh: vi.fn() } as unknown as PlaybackService,
      viewports,
      ruleset,
    );
    const mode = new FourLaneMode();
    editing.registry.register(mode);

    const descriptor = new SongView(documentService.data)
      .getTrackDescriptors()
      .find((track) => track.name === "LEAD GUITAR")!;
    expect(editing.registry.resolve(descriptor, "test-view")?.id).toBe(
      "test.fourLane",
    );
    const toolbarSession = editing.getEditingSession("viewport-1", mode.id)!;
    const groups = createModeToolbarGroups(toolbarSession);
    expect(groups[0]?.items.map((tool) => tool.id)).toEqual(
      lanes.map((lane) => `lane-${lane}`),
    );
    const editorState = {
      session: viewports.getActiveViewport()!,
      mode,
      toolState: mode.createDefaultToolState(),
      snapEnabled: true,
      snapDenominator: 4,
      lockCursor: true,
      vocalPitchFeedbackEnabled: false,
    };
    expect(
      groups[0]!.items[0]!.actionPayload?.(
        {
          activeView: "piano-roll",
          trackType: "LEAD GUITAR",
          sessionId: "viewport-1",
          playbackTick: 0,
          canHostView: () => true,
        },
        editorState,
      ),
    ).toEqual(["viewport-1", "test.fourLane", { lane: "green" }]);

    const session = editing.getEditingSession("viewport-1", "test.fourLane")!;
    const context = new ContextStore();
    const editingContext = createEditingContextSnapshot(session);
    context.update(editingContext.values);
    expect(context.get("editing.mode")).toBe("test.fourLane");
    expect(context.get(`editing.can.${GeneralCommandType.AddNotes}`)).toBe(
      true,
    );
    expect(context.get(`editing.can.${GeneralCommandType.MoveNotes}`)).toBe(
      true,
    );
    context.update(
      createEditingContextSnapshot(session, ["REMOVED_COMMAND"]).values,
    );
    expect(context.get("editing.can.REMOVED_COMMAND")).toBe(false);
    expect(
      session.execute({
        type: GeneralCommandType.AddNotes,
        notes: [
          {
            trackIndex: 0,
            tick: 240,
            pitch: 64,
            duration: 120,
          },
        ],
      }).changed,
    ).toBe(true);

    const noteId = editing
      .getCommandExecutor()
      ?.getNoteId(0, documentService.data.tracks[0]!.getNotes()[0]!)!;
    const cancelled = session.beginGesture();
    cancelled.preview({
      type: GeneralCommandType.MoveNotes,
      targetIds: [noteId],
      tickDelta: 120,
      pitchDelta: 0,
    });
    expect(documentService.data.tracks[0]!.getNotes()[0]!.start).toBe(0);
    cancelled.cancel();
    expect(documentService.data.tracks[0]!.getNotes()[0]!.start).toBe(0);

    const committed = session.beginGesture();
    committed.preview({
      type: GeneralCommandType.MoveNotes,
      targetIds: [noteId],
      tickDelta: 120,
      pitchDelta: 0,
    });
    expect(committed.commit().changed).toBe(true);
    expect(documentService.data.tracks[0]!.getNotes()[0]!.start).toBe(120);
    documentService.undoEdit();
    expect(documentService.data.tracks[0]!.getNotes()[0]!.start).toBe(0);

    const copiedNote = editing.getCommandExecutor()?.getHandleFromId(noteId)!;
    session.clipboard.setData({
      sourceModeId: "test.fourLane",
      entities: [
        {
          relativeTick: 0,
          duration: copiedNote.duration,
          velocity: copiedNote.velocity,
          pitch: copiedNote.pitch,
          row: session.getProjection().rowForNote(copiedNote)?.id,
          classification: session.classifyNote(copiedNote),
        },
      ],
    });
    expect(session.clipboard.getData()?.entities[0]).toMatchObject({
      pitch: copiedNote.pitch,
      duration: copiedNote.duration,
      classification: session.classifyNote(copiedNote),
    });
    expect(
      editing
        .getEditingSession("viewport-1", "test.fourLane")!
        .pasteClipboard(960).createdIds,
    ).toHaveLength(1);
    expect(documentService.data.tracks[0]!.getNotes()).toContainEqual(
      expect.objectContaining({ start: 960, pitch: copiedNote.pitch }),
    );
  });
});
