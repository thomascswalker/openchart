import type { TrackDescriptor } from "../../config.js";
import { describeTrack } from "../../config.js";
import type { EntityId } from "../entityId.js";
import type { EditCommand, RawCommand } from "../commands.js";
import type { ModeContext } from "../mode.js";
import type { NoteSnapshot } from "../reader.js";
import type { Rejection } from "../result.js";

export function rejection(
  command: EditCommand,
  code: string,
  message: string,
): Rejection {
  return { command, code, message };
}

export function rejected(command: EditCommand, code: string, message: string) {
  return {
    commands: [] as readonly RawCommand[],
    rejections: [rejection(command, code, message)],
  };
}

export function targetTrackIndex(context: ModeContext): number {
  return context.target.trackIndex ?? 0;
}

export function targetDescriptor(context: ModeContext): TrackDescriptor | null {
  const byIndex =
    context.target.trackIndex === null
      ? null
      : context.reader.getTrackDescriptor(context.target.trackIndex);
  if (byIndex) return byIndex;
  const config = context.config.tracks.find(
    (track) => describeTrack(track).key === context.target.trackKey,
  );
  return config ? describeTrack(config) : null;
}

export function targetNotes(context: ModeContext): readonly NoteSnapshot[] {
  return context.target.trackIndex === null
    ? []
    : context.reader.getNotes(context.target.trackIndex);
}

export function ownsNotes(
  ids: readonly string[],
  context: ModeContext,
  command: EditCommand,
): { notes: NoteSnapshot[]; rejection: Rejection | null } {
  const notes: NoteSnapshot[] = [];
  for (const id of ids) {
    const note = context.reader.getNote(id as EntityId);
    if (!note) {
      return {
        notes: [],
        rejection: rejection(
          command,
          "missing-note",
          `Note '${id}' does not exist`,
        ),
      };
    }
    if (
      context.target.trackIndex !== null &&
      note.trackIndex !== context.target.trackIndex
    ) {
      return {
        notes: [],
        rejection: rejection(
          command,
          "wrong-track",
          `Note '${id}' does not belong to the session target`,
        ),
      };
    }
    notes.push(note);
  }
  return { notes, rejection: null };
}

export function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

export function validTick(tick: number): boolean {
  return Number.isSafeInteger(tick) && tick >= 0;
}

export function validSpan(startTick: number, endTick: number): boolean {
  return (
    validTick(startTick) && Number.isSafeInteger(endTick) && endTick > startTick
  );
}
