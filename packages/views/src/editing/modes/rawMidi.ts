import { z } from "zod";
import type { EditCommand, RawCommandType } from "../commands.js";
import type { EntityId } from "../entityId.js";
import {
  isRawCommand,
  type EditingMode,
  type ExpansionResult,
  type ModeContext,
  type Projection,
} from "../mode.js";
import type { NoteSnapshot } from "../reader.js";
import type { Rejection } from "../result.js";

const noteCommandTypes: ReadonlySet<RawCommandType> = new Set([
  "ADD_NOTES",
  "UPDATE_NOTES",
  "MOVE_NOTES",
  "RESIZE_NOTES",
  "DELETE_ENTITIES",
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
    id: "midi.raw",
    label: "Raw MIDI",
    hostKinds: new Set(["piano-roll"]),
    appliesTo: (track) => track.type === "instrument",
    capabilities: {
      rawCommands: noteCommandTypes,
      domainCommands: new Set(),
      entityKinds: new Set(["note"]),
      canCreateTrack: true,
      requiresDifficulty: false,
    },
    tools: [],
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
      kind: "note",
      subtype: "raw",
      movable: true,
      resizable: true,
    }),
    expand: (command, context) => expandRawCommand(command, context),
  };
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
    case "ADD_NOTES":
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
    case "UPDATE_NOTES":
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
    case "MOVE_NOTES":
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
    case "RESIZE_NOTES":
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
    case "DELETE_ENTITIES":
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
