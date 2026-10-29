import type { EditCommand } from "./commands";
import type { RuleViolation } from "../ruleset/index";
import type { EntityId } from "./entity";

/** A command-specific explanation for an edit that could not be expanded. */
export interface Rejection {
  code: string;
  message: string;
  command: EditCommand;
}

/** Outcome and affected stable IDs for a command or atomic command batch. */
export interface EditResult {
  changed: boolean;
  createdIds: readonly EntityId[];
  updatedIds: readonly EntityId[];
  removedIds: readonly EntityId[];
  rejections: readonly Rejection[];
  /** Non-blocking `warning`/`info` rule violations from the ruleset. */
  diagnostics: readonly RuleViolation[];
}

/** Fatal preflight rejection; the batch has not mutated the document. */
export class EditRejectedError extends Error {
  public readonly code: string;
  public readonly command: EditCommand;

  public constructor(code: string, message: string, command: EditCommand) {
    super(message);
    this.name = "EditRejectedError";
    this.code = code;
    this.command = command;
  }
}

/** Creates an unchanged, rejection-free result. */
export function emptyEditResult(): EditResult {
  return {
    changed: false,
    createdIds: [],
    updatedIds: [],
    removedIds: [],
    rejections: [],
    diagnostics: [],
  };
}
