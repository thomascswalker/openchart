import { Midi } from "@openchart/midi";
import {
  EditCommandType,
  EntityType,
  SongView,
  type ClipboardPayload,
  type EditingMode,
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

function fourLaneMode(): EditingMode<FourLaneToolState> {
  const rejected = (
    command: Parameters<EditingMode["expand"]>[0],
  ): ExpansionResult => ({
    commands: [],
    rejections: [
      {
        code: "unsupported-command",
        message: "Unsupported by test.fourLane",
        command,
      },
    ],
  });
  return {
    id: "test.fourLane",
    label: "Four Lane Test",
    hostKinds: new Set(["test-view"]),
    appliesTo: () => true,
    capabilities: {
      rawCommands: new Set([
        EditCommandType.AddNotes,
        EditCommandType.MoveNotes,
        EditCommandType.DeleteEntities,
      ]),
      domainCommands: new Set(),
      entityKinds: new Set([EntityType.Note]),
      canCreateTrack: false,
      requiresDifficulty: false,
    },
    toolStateSchema: z.object({ lane: z.enum(lanes) }),
    createDefaultToolState: () => ({ lane: "green" }),
    createTools: () =>
      lanes.map((lane) => ({
        id: `lane-${lane}`,
        label: `${lane[0]!.toUpperCase()}${lane.slice(1)} lane`,
        icon: "note",
        group: "four-lane-tools",
        stateKey: "lane",
        value: lane,
      })),
    createProjection: (): Projection => ({
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
    }),
    classify: () => ({
      type: EntityType.Note,
      subtype: "four-lane",
      movable: true,
      resizable: true,
    }),
    expandPaste: (
      payload: ClipboardPayload,
      anchorTick: number,
      context: ModeContext,
    ): ExpansionResult => ({
      commands: [
        {
          type: EditCommandType.AddNotes,
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
    }),
    expand: (command) => {
      if (
        command.type === EditCommandType.AddNotes ||
        command.type === EditCommandType.MoveNotes ||
        command.type === EditCommandType.DeleteEntities
      ) {
        return { commands: [command as GeneralCommand], rejections: [] };
      }
      return rejected(command);
    },
  };
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
    const mode = fourLaneMode();
    editing.registry.register(mode);

    const descriptor = new SongView(documentService.data)
      .getTrackDescriptors()
      .find((track) => track.name === "LEAD GUITAR")!;
    expect(editing.registry.resolve(descriptor, "test-view")?.id).toBe(
      "test.fourLane",
    );
    const toolbarSession = editing.getSession("viewport-1", mode.id)!;
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

    const session = editing.getSession("viewport-1", "test.fourLane")!;
    const context = new ContextStore();
    const editingContext = createEditingContextSnapshot(session);
    context.update(editingContext.values);
    expect(context.get("editing.mode")).toBe("test.fourLane");
    expect(context.get(`editing.can.${EditCommandType.AddNotes}`)).toBe(true);
    expect(context.get(`editing.can.${EditCommandType.MoveNotes}`)).toBe(true);
    context.update(
      createEditingContextSnapshot(session, ["REMOVED_COMMAND"]).values,
    );
    expect(context.get("editing.can.REMOVED_COMMAND")).toBe(false);
    expect(
      session.execute({
        type: EditCommandType.AddNotes,
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
      .getDocument()
      .getNoteId(0, documentService.data.tracks[0]!.getNotes()[0]!);
    const cancelled = session.beginGesture();
    cancelled.preview({
      type: EditCommandType.MoveNotes,
      targetIds: [noteId],
      tickDelta: 120,
      pitchDelta: 0,
    });
    expect(documentService.data.tracks[0]!.getNotes()[0]!.start).toBe(0);
    cancelled.cancel();
    expect(documentService.data.tracks[0]!.getNotes()[0]!.start).toBe(0);

    const committed = session.beginGesture();
    committed.preview({
      type: EditCommandType.MoveNotes,
      targetIds: [noteId],
      tickDelta: 120,
      pitchDelta: 0,
    });
    expect(committed.commit().changed).toBe(true);
    expect(documentService.data.tracks[0]!.getNotes()[0]!.start).toBe(120);
    documentService.undoEdit();
    expect(documentService.data.tracks[0]!.getNotes()[0]!.start).toBe(0);

    const copiedNote = editing.getDocument().getNote(noteId)!;
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
      editing.getSession("viewport-1", "test.fourLane")!.pasteClipboard(960)
        .createdIds,
    ).toHaveLength(1);
    expect(documentService.data.tracks[0]!.getNotes()).toContainEqual(
      expect.objectContaining({ start: 960, pitch: copiedNote.pitch }),
    );
  });
});
