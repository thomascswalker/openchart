import type { EditCommand, RawCommand } from "./commands.js";
import type { EntityId } from "./entityId.js";
import type { ChartDocumentReader, NoteSnapshot } from "./reader.js";
import type { RuleViolation } from "../ruleset/index.js";
import type { Rejection } from "./result.js";

/** Volatile note projection produced without changing MIDI or history. */
export interface PreviewState {
  updated: ReadonlyMap<EntityId, NoteSnapshot>;
  added: readonly NoteSnapshot[];
  removed: ReadonlySet<EntityId>;
  rejections: readonly Rejection[];
  /** Rule violations the edit would cause (errors become rejections on commit). */
  diagnostics: readonly RuleViolation[];
}

/** Computes the visible note overlay for raw commands without mutating reader. */
export function computePreview(
  commands: readonly RawCommand[],
  reader: ChartDocumentReader,
): PreviewState {
  const updated = new Map<EntityId, NoteSnapshot>();
  const added = new Map<EntityId, NoteSnapshot>();
  const removed = new Set<EntityId>();
  const rejections: Rejection[] = [];
  let nextPendingId = 0;

  const current = (id: EntityId): NoteSnapshot | null => {
    if (removed.has(id)) return null;
    return added.get(id) ?? updated.get(id) ?? reader.getNote(id);
  };
  const reject = (command: EditCommand, code: string, message: string) => {
    rejections.push({ code, message, command });
  };
  const update = (id: EntityId, snapshot: NoteSnapshot) => {
    if (added.has(id)) {
      added.set(id, snapshot);
      return;
    }
    const original = reader.getNote(id);
    if (original && sameNote(original, snapshot)) updated.delete(id);
    else updated.set(id, snapshot);
  };
  const validNote = (note: {
    tick: number;
    pitch: number;
    duration: number;
  }): boolean =>
    Number.isSafeInteger(note.tick) &&
    note.tick >= 0 &&
    Number.isInteger(note.pitch) &&
    note.pitch >= 0 &&
    note.pitch <= 127 &&
    Number.isSafeInteger(note.duration) &&
    note.duration >= 1;

  for (const command of commands) {
    switch (command.type) {
      case "ADD_NOTES":
        for (const spec of command.notes) {
          if (
            !Number.isSafeInteger(spec.trackIndex) ||
            spec.trackIndex < 0 ||
            !validNote(spec) ||
            (spec.velocity !== undefined &&
              (!Number.isInteger(spec.velocity) ||
                spec.velocity < 1 ||
                spec.velocity > 127))
          ) {
            reject(command, "invalid-note", "Added note fields are invalid");
            continue;
          }
          const id = `pending:${nextPendingId++}` as EntityId;
          added.set(id, {
            id,
            trackIndex: spec.trackIndex,
            tick: spec.tick,
            pitch: spec.pitch,
            duration: spec.duration,
            velocity: spec.velocity ?? 100,
          });
        }
        break;
      case "UPDATE_NOTES":
        for (const patch of command.patches) {
          const note = current(patch.id);
          if (!note) {
            reject(
              command,
              "missing-note",
              `Note '${patch.id}' does not exist`,
            );
            continue;
          }
          const next = {
            ...note,
            tick: patch.tick ?? note.tick,
            pitch: patch.pitch ?? note.pitch,
            duration: patch.duration ?? note.duration,
            velocity: patch.velocity ?? note.velocity,
          };
          if (
            !validNote(next) ||
            !Number.isSafeInteger(next.tick + next.duration) ||
            !Number.isInteger(next.velocity) ||
            next.velocity < 1 ||
            next.velocity > 127
          ) {
            reject(
              command,
              "invalid-note",
              `Note '${patch.id}' fields are invalid`,
            );
            continue;
          }
          update(patch.id, next);
        }
        break;
      case "MOVE_NOTES":
        for (const id of command.targetIds) {
          const note = current(id);
          if (!note) {
            reject(command, "missing-note", `Note '${id}' does not exist`);
            continue;
          }
          if (
            !Number.isSafeInteger(command.tickDelta) ||
            !Number.isSafeInteger(command.pitchDelta)
          ) {
            reject(command, "invalid-delta", "Move deltas must be integers");
            continue;
          }
          const next = {
            ...note,
            tick: Math.max(0, note.tick + command.tickDelta),
            pitch: Math.max(0, Math.min(127, note.pitch + command.pitchDelta)),
          };
          if (!Number.isSafeInteger(next.tick + next.duration)) {
            reject(
              command,
              "invalid-note-range",
              "Moved note end tick is too large",
            );
            continue;
          }
          update(id, next);
        }
        break;
      case "RESIZE_NOTES":
        for (const id of command.targetIds) {
          const note = current(id);
          if (!note) {
            reject(command, "missing-note", `Note '${id}' does not exist`);
            continue;
          }
          if (!Number.isSafeInteger(command.durationDelta)) {
            reject(
              command,
              "invalid-delta",
              "Duration delta must be an integer",
            );
            continue;
          }
          const duration = Math.max(1, note.duration + command.durationDelta);
          if (
            !Number.isSafeInteger(duration) ||
            !Number.isSafeInteger(note.tick + duration)
          ) {
            reject(
              command,
              "invalid-note-range",
              "Resized note end tick is too large",
            );
            continue;
          }
          update(id, {
            ...note,
            duration,
          });
        }
        break;
      case "DELETE_ENTITIES":
        for (const id of command.targetIds) {
          if (added.delete(id)) continue;
          if (reader.getNote(id) || updated.has(id)) {
            updated.delete(id);
            removed.add(id);
          }
        }
        break;
      case "ADD_TEXT":
      case "UPDATE_TEXT":
      case "SET_TEMPO":
      case "REMOVE_TEMPO":
      case "SET_TIME_SIGNATURE":
      case "REMOVE_TIME_SIGNATURE":
        break;
    }
  }

  return {
    updated,
    added: [...added.values()],
    removed,
    rejections,
    diagnostics: [],
  };
}

function sameNote(left: NoteSnapshot, right: NoteSnapshot): boolean {
  return (
    left.trackIndex === right.trackIndex &&
    left.tick === right.tick &&
    left.pitch === right.pitch &&
    left.duration === right.duration &&
    left.velocity === right.velocity
  );
}
