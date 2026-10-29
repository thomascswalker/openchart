import { z } from "zod";
import { EntityType } from "../../entity";
import { isUnmappedTrackRules } from "../../../ruleset/compile";
import type { ClipboardPayload } from "../../clipboard";
import {
  EditCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../../commands";
import type { EntityId } from "../../entity";
import {
  EditingModeId,
  isRawCommand,
  type EditingMode,
  type ExpansionResult,
  type ModeContext,
  type Projection,
} from "../../modes/mode";
import type { NoteSnapshot } from "../../reader";
import type { Rejection } from "../../result";

const noteCommandTypes: ReadonlySet<EditCommandType> = new Set([
  EditCommandType.AddNotes,
  EditCommandType.UpdateNotes,
  EditCommandType.MoveNotes,
  EditCommandType.ResizeNotes,
  EditCommandType.DeleteEntities,
]);

const rows = Array.from({ length: 128 }, (_, pitch) => ({
  id: String(pitch),
  label: String(pitch),
  index: pitch,
  kind: "pitch",
}));

/** Creates the unrestricted pitch-grid mode used by the Piano Roll. */
export function createRawMidiMode(): EditingMode<Record<string, never>> {
  return {
    id: EditingModeId.MidiRaw,
    label: "Raw MIDI",
    hostKinds: new Set(["piano-roll"]),
    appliesTo: (track) =>
      isUnmappedTrackRules(track.rules) ||
      (track.kind !== "header" && track.kind !== "global"),
    capabilities: {
      rawCommands: noteCommandTypes,
      domainCommands: new Set(),
      entityKinds: new Set([EntityType.Note]),
      canCreateTrack: true,
      requiresDifficulty: false,
    },
    createTools: () => [],
    toolStateSchema: z.object({}),
    createDefaultToolState: () => ({}),
    createProjection: (): Projection => ({
      getRows: () => rows,
      rowForNote: (note) => rows[note.pitch] ?? null,
      pitchForRow: (row) =>
        Number.isInteger(row.index) && row.index >= 0 && row.index <= 127
          ? row.index
          : null,
    }),
    classify: () => ({
      type: EntityType.Note,
      kind: EntityType.Note,
      subtype: "raw",
      movable: true,
      resizable: true,
    }),
    expandPaste: (payload, anchorTick, context) =>
      expandRawPaste(payload, anchorTick, context),
    expand: (command, context) => expandRawCommand(command, context),
  };
}

function expandRawPaste(
  payload: ClipboardPayload,
  anchorTick: number,
  context: ModeContext,
): ExpansionResult {
  const commands: GeneralCommand[] = [];
  const rejections: Rejection[] = [];
  for (const entity of payload.entities) {
    const command: GeneralCommand = {
      type: EditCommandType.AddNotes,
      notes: [
        {
          trackIndex: context.target.trackIndex ?? 0,
          tick: anchorTick + entity.relativeTick,
          pitch: entity.pitch,
          duration: entity.duration,
          velocity: entity.velocity,
        },
      ],
    };
    const expansion = expandRawCommand(command, context);
    commands.push(...expansion.commands);
    rejections.push(...expansion.rejections);
  }
  return { commands, rejections };
}

function expandRawCommand(
  command: EditCommand,
  context: ModeContext,
): ExpansionResult {
  if (!isRawCommand(command) || !noteCommandTypes.has(command.type)) {
    return {
      commands: [],
      rejections: [
        reject(
          command,
          "unsupported-command",
          "Command is not supported by midi.raw",
        ),
      ],
    };
  }

  const rejections: Rejection[] = [];
  const rejectCommand = (code: string, message: string) => {
    rejections.push({ code, message, command });
  };
  const ownsNote = (id: EntityId): NoteSnapshot | null => {
    const note = context.reader.getNote(id);
    if (!note) {
      rejectCommand("missing-note", `Note '${id}' does not exist`);
      return null;
    }
    if (
      context.target.trackIndex !== null &&
      note.trackIndex !== context.target.trackIndex
    ) {
      rejectCommand(
        "wrong-track",
        `Note '${id}' does not belong to the session target`,
      );
      return null;
    }
    return note;
  };

  switch (command.type) {
    case EditCommandType.AddNotes:
      for (const note of command.notes) {
        if (
          !Number.isSafeInteger(note.trackIndex) ||
          note.trackIndex < 0 ||
          !validNoteFields(note.tick, note.pitch, note.duration) ||
          (note.velocity !== undefined &&
            (!Number.isInteger(note.velocity) ||
              note.velocity < 1 ||
              note.velocity > 127))
        ) {
          rejectCommand("invalid-note", "Added note fields are invalid");
          continue;
        }
        if (
          context.target.trackIndex !== null &&
          note.trackIndex !== context.target.trackIndex
        ) {
          rejectCommand(
            "wrong-track",
            "Added notes must belong to the session target",
          );
        }
      }
      break;
    case EditCommandType.UpdateNotes:
      for (const patch of command.patches) {
        const note = ownsNote(patch.id);
        if (!note) continue;
        const tick = patch.tick ?? note.tick;
        const pitch = patch.pitch ?? note.pitch;
        const duration = patch.duration ?? note.duration;
        const velocity = patch.velocity ?? note.velocity;
        if (
          !validNoteFields(tick, pitch, duration) ||
          !Number.isInteger(velocity) ||
          velocity < 1 ||
          velocity > 127 ||
          !Number.isSafeInteger(tick + duration)
        ) {
          rejectCommand(
            "invalid-note",
            `Note '${patch.id}' fields are invalid`,
          );
        }
      }
      break;
    case EditCommandType.MoveNotes:
      if (
        !Number.isSafeInteger(command.tickDelta) ||
        !Number.isSafeInteger(command.pitchDelta)
      ) {
        rejectCommand("invalid-delta", "Move deltas must be integers");
      }
      for (const id of command.targetIds) {
        const note = ownsNote(id);
        if (!note) continue;
        const tick = Math.max(0, note.tick + command.tickDelta);
        if (
          !Number.isSafeInteger(tick) ||
          !Number.isSafeInteger(tick + note.duration)
        ) {
          rejectCommand(
            "invalid-note-range",
            `Note '${id}' end tick is too large`,
          );
        }
      }
      break;
    case EditCommandType.ResizeNotes:
      if (!Number.isSafeInteger(command.durationDelta)) {
        rejectCommand("invalid-delta", "Duration delta must be an integer");
      }
      for (const id of command.targetIds) {
        const note = ownsNote(id);
        if (!note) continue;
        const duration = Math.max(1, note.duration + command.durationDelta);
        if (
          !Number.isSafeInteger(duration) ||
          !Number.isSafeInteger(note.tick + duration)
        ) {
          rejectCommand(
            "invalid-note-range",
            `Note '${id}' end tick is too large`,
          );
        }
      }
      break;
    case EditCommandType.DeleteEntities:
      for (const id of command.targetIds) ownsNote(id);
      break;
  }

  return {
    commands: rejections.length === 0 ? [command] : [],
    rejections,
  };
}

function validNoteFields(
  tick: number,
  pitch: number,
  duration: number,
): boolean {
  return (
    Number.isSafeInteger(tick) &&
    tick >= 0 &&
    Number.isInteger(pitch) &&
    pitch >= 0 &&
    pitch <= 127 &&
    Number.isSafeInteger(duration) &&
    duration >= 1
  );
}

function reject(
  command: EditCommand,
  code: string,
  message: string,
): Rejection {
  return { code, message, command };
}
