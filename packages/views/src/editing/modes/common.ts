import type { TrackDescriptor, TrackRules } from "../../ruleset/compile";
import type { EntityId } from "../entity";
import type { EditCommand, GeneralCommand } from "../commands";
import type { ModeContext } from "../modes/mode";
import type { NoteHandle } from "../entity";
import type { Rejection } from "../result";

export function rejection(
  command: EditCommand,
  code: string,
  message: string,
): Rejection {
  return { command, code, message };
}

export function rejected(command: EditCommand, code: string, message: string) {
  return {
    commands: [] as readonly GeneralCommand[],
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
      : context.executor.getTrackDescriptor(context.target.trackIndex);
  if (byIndex) return byIndex;
  return (
    context.rules
      .descriptors()
      .find((track) => track.key === context.target.trackKey) ?? null
  );
}

/** Compiled rules of the session's target track, if it is configured. */
export function targetRules(context: ModeContext): TrackRules | null {
  return targetDescriptor(context)?.rules ?? null;
}

export function targetNotes(context: ModeContext): readonly NoteHandle[] {
  return context.target.trackIndex === null
    ? []
    : context.executor.getNotes(context.target.trackIndex);
}

export function ownsNotes(
  ids: readonly string[],
  context: ModeContext,
  command: EditCommand,
): { notes: NoteHandle[]; rejection: Rejection | null } {
  const notes: NoteHandle[] = [];
  for (const id of ids) {
    const note = context.executor.getNote(id as EntityId);
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
