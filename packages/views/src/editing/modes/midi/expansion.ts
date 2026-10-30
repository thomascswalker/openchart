import type { AbstractEditingMode } from "../mode";
import {
  GeneralCommandType,
  GeneralOf,
  type GeneralCommand,
} from "../../commands";
import type { EntityId, NoteHandle } from "../../entity";
import type { Rejection } from "../../result";
import type { ExpanderFn, ExpansionResult, ModeContext } from "../mode";

/** Collects rejections for one command and yields it unchanged when valid. */
class Validation {
  public readonly rejections: Rejection[] = [];

  public constructor(
    private readonly mode: AbstractEditingMode,
    private readonly command: GeneralCommand,
    private readonly context: ModeContext,
  ) {}

  public reject(code: string, message: string): void {
    this.rejections.push({ command: this.command, code, message });
  }

  public ownsNote(id: EntityId): NoteHandle | null {
    const note = this.context.executor.getHandleFromId(id);
    if (!note) {
      this.reject("missing-note", `Note '${id}' does not exist`);
      return null;
    }
    const trackIndex = this.context.target.trackIndex;
    if (trackIndex !== null && note.trackIndex !== trackIndex) {
      this.reject(
        "wrong-track",
        `Note '${id}' does not belong to the session target`,
      );
      return null;
    }
    return note;
  }

  public result(): ExpansionResult {
    return {
      commands: this.rejections.length === 0 ? [this.command] : [],
      rejections: this.rejections,
    };
  }
}

export function validNoteFields(
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

export function expandAddNotes(
  mode: AbstractEditingMode,
  command: GeneralOf<GeneralCommandType.AddNotes>,
  context: ModeContext,
): ExpansionResult {
  const validation = new Validation(mode, command, context);
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
      validation.reject("invalid-note", "Added note fields are invalid");
      continue;
    }
    if (
      context.target.trackIndex !== null &&
      note.trackIndex !== context.target.trackIndex
    ) {
      validation.reject(
        "wrong-track",
        "Added notes must belong to the session target",
      );
    }
  }
  return validation.result();
}

export function expandUpdateNotes(
  mode: AbstractEditingMode,
  command: GeneralOf<GeneralCommandType.UpdateNotes>,
  context: ModeContext,
): ExpansionResult {
  const validation = new Validation(mode, command, context);
  for (const patch of command.patches) {
    const note = validation.ownsNote(patch.id);
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
      validation.reject(
        "invalid-note",
        `Note '${patch.id}' fields are invalid`,
      );
    }
  }
  return validation.result();
}

export function expandMoveNotes(
  mode: AbstractEditingMode,
  command: GeneralOf<GeneralCommandType.MoveNotes>,
  context: ModeContext,
): ExpansionResult {
  const validation = new Validation(mode, command, context);
  if (
    !Number.isSafeInteger(command.tickDelta) ||
    !Number.isSafeInteger(command.pitchDelta)
  ) {
    validation.reject("invalid-delta", "Move deltas must be integers");
  }
  for (const id of command.targetIds) {
    const note = validation.ownsNote(id);
    if (!note) continue;
    const tick = Math.max(0, note.tick + command.tickDelta);
    if (
      !Number.isSafeInteger(tick) ||
      !Number.isSafeInteger(tick + note.duration)
    ) {
      validation.reject(
        "invalid-note-range",
        `Note '${id}' end tick is too large`,
      );
    }
  }
  return validation.result();
}

export function expandResizeNotes(
  mode: AbstractEditingMode,
  command: GeneralOf<GeneralCommandType.ResizeNotes>,
  context: ModeContext,
): ExpansionResult {
  const validation = new Validation(mode, command, context);
  if (!Number.isSafeInteger(command.durationDelta)) {
    validation.reject("invalid-delta", "Duration delta must be an integer");
  }
  for (const id of command.targetIds) {
    const note = validation.ownsNote(id);
    if (!note) continue;
    const duration = Math.max(1, note.duration + command.durationDelta);
    if (
      !Number.isSafeInteger(duration) ||
      !Number.isSafeInteger(note.tick + duration)
    ) {
      validation.reject(
        "invalid-note-range",
        `Note '${id}' end tick is too large`,
      );
    }
  }
  return validation.result();
}

export function expandDeleteEntities(
  mode: AbstractEditingMode,
  command: GeneralOf<GeneralCommandType.DeleteEntities>,
  context: ModeContext,
): ExpansionResult {
  const validation = new Validation(mode, command, context);
  for (const id of command.targetIds) validation.ownsNote(id);
  return validation.result();
}

const ExpansionCommandMap = new Map<string, ExpanderFn>([
  [GeneralCommandType.AddNotes, expandAddNotes as ExpanderFn],
  [GeneralCommandType.UpdateNotes, expandUpdateNotes as ExpanderFn],
  [GeneralCommandType.MoveNotes, expandMoveNotes as ExpanderFn],
  [GeneralCommandType.ResizeNotes, expandResizeNotes as ExpanderFn],
  [GeneralCommandType.DeleteEntities, expandDeleteEntities as ExpanderFn],
]);

export function getExpander(commandType: string): ExpanderFn | undefined {
  return ExpansionCommandMap.get(commandType);
}
