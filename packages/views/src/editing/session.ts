import type { SongViewConfig } from "../config.js";
import type { ChartDocument } from "./chartDocument.js";
import type { EditCommand, RawCommand, RawCommandType } from "./commands.js";
import { computePreview, type PreviewState } from "./preview.js";
import {
  EditRejectedError,
  emptyEditResult,
  type EditResult,
  type Rejection,
} from "./result.js";
import type {
  EditingMode,
  EditingTarget,
  ModeContext,
  Projection,
} from "./mode.js";

/** Transaction operations supplied by the document/history owner. */
export interface EditTransactionPort {
  begin(): void;
  record(): void;
  end(): void;
  rollback(): boolean;
}

/** Optional behavior for a command or command batch. */
export interface ExecuteOptions {
  throwOnReject?: boolean;
}

/** Editing commands and projection bound to one mode, target, and viewport. */
export interface EditingSession {
  readonly mode: EditingMode;
  readonly target: EditingTarget;
  readonly hostKind: string;
  getProjection(): Projection;
  can(commandType: string): boolean;
  execute(command: EditCommand, options?: ExecuteOptions): EditResult;
  executeBatch(
    commands: readonly EditCommand[],
    options?: ExecuteOptions,
  ): EditResult;
  beginGesture(): GestureHandle;
  getToolState(): unknown;
}

/** Preview/commit/cancel handle for one continuous editing gesture. */
export interface GestureHandle {
  preview(command: EditCommand): PreviewState;
  commit(): EditResult;
  cancel(): void;
  readonly isOpen: boolean;
}

/** Inputs required to bind a mode to one mutable chart document. */
export interface CreateEditingSessionOptions {
  document: ChartDocument;
  mode: EditingMode;
  target: EditingTarget;
  hostKind: string;
  config: SongViewConfig;
  transaction: EditTransactionPort;
  onCommit?: (result: EditResult) => void;
}

/** Creates an editing session backed by the supplied transaction port. */
export function createEditingSession(
  options: CreateEditingSessionOptions,
): EditingSession {
  return new EditingSessionImpl(options);
}

class EditingSessionImpl implements EditingSession {
  public readonly mode: EditingMode;
  public readonly hostKind: string;
  private readonly document: ChartDocument;
  private readonly config: SongViewConfig;
  private readonly transaction: EditTransactionPort;
  private readonly onCommit: ((result: EditResult) => void) | undefined;
  private targetValue: EditingTarget;
  private readonly toolState: unknown;

  public constructor(options: CreateEditingSessionOptions) {
    this.document = options.document;
    this.mode = options.mode;
    this.targetValue = { ...options.target };
    this.hostKind = options.hostKind;
    this.config = options.config;
    this.transaction = options.transaction;
    this.onCommit = options.onCommit;
    this.toolState = this.mode.toolStateSchema.parse(
      this.mode.createDefaultToolState(),
    );
  }

  public get target(): EditingTarget {
    return this.targetValue;
  }

  public getProjection(): Projection {
    return this.mode.createProjection(this.createModeContext());
  }

  public can(commandType: string): boolean {
    return (
      this.mode.capabilities.rawCommands.has(commandType as RawCommandType) ||
      this.mode.capabilities.domainCommands.has(commandType)
    );
  }

  public execute(command: EditCommand, options?: ExecuteOptions): EditResult {
    return this.executeBatch([command], options);
  }

  public executeBatch(
    commands: readonly EditCommand[],
    options: ExecuteOptions = {},
  ): EditResult {
    if (commands.length === 0) return emptyEditResult();

    const expanded = commands.map((command) => this.expand(command));
    const rawCommands = expanded.flatMap((result) => result.commands);
    const rejections = expanded.flatMap((result) => result.rejections);
    if (rawCommands.length === 0) {
      this.throwIfAllRejected(commands, expanded, options);
      return { ...emptyEditResult(), rejections };
    }

    const triggerCommand = rawCommands[0]!;
    const targetBeforeTransaction = this.targetValue;
    let transactionStarted = false;
    let combinedResult: EditResult;
    try {
      this.transaction.begin();
      transactionStarted = true;
      const boundCommands = this.bindTargetTrack(rawCommands);
      const result = this.document.applyBatch(boundCommands);
      if (result.changed) this.transaction.record();
      this.transaction.end();
      transactionStarted = false;

      combinedResult = { ...result, rejections };
    } catch (error) {
      if (transactionStarted) {
        let rolledBack: boolean;
        try {
          rolledBack = this.transaction.rollback();
        } catch (rollbackError) {
          throw new EditRejectedError(
            "rollback-failed",
            `Edit failed and rollback threw: ${describeError(rollbackError)}`,
            triggerCommand,
          );
        }
        if (!rolledBack) {
          throw new EditRejectedError(
            "rollback-failed",
            `Edit failed and the transaction could not be rolled back: ${describeError(error)}`,
            triggerCommand,
          );
        }
        this.targetValue = targetBeforeTransaction;
      }
      if (error instanceof EditRejectedError) throw error;
      throw new EditRejectedError(
        "edit-failed",
        describeError(error),
        triggerCommand,
      );
    }

    if (combinedResult.changed) this.onCommit?.(combinedResult);
    return combinedResult;
  }

  public beginGesture(): GestureHandle {
    return new EditingGesture(this);
  }

  public previewCommand(command: EditCommand): PreviewState {
    const expansion = this.expand(command);
    const preview = computePreview(expansion.commands, this.document);
    return {
      ...preview,
      rejections: [...expansion.rejections, ...preview.rejections],
    };
  }

  public getToolState(): unknown {
    return this.toolState;
  }

  private createModeContext(): ModeContext {
    return {
      reader: this.document,
      target: this.targetValue,
      config: this.config,
    };
  }

  private expand(command: EditCommand) {
    if (!this.can(command.type)) {
      return {
        commands: [],
        rejections: [
          {
            code: "unsupported-command",
            message: `Command '${command.type}' is not supported by mode '${this.mode.id}'`,
            command,
          },
        ],
      };
    }
    return this.mode.expand(command, this.createModeContext(), this.toolState);
  }

  private bindTargetTrack(commands: readonly RawCommand[]): RawCommand[] {
    const createsNotes = commands.some(
      (command) => command.type === "ADD_NOTES" && command.notes.length > 0,
    );
    const materializesTarget =
      this.targetValue.trackIndex === null && createsNotes;
    if (this.targetValue.trackIndex === null && createsNotes) {
      if (!this.mode.capabilities.canCreateTrack) {
        throw new EditRejectedError(
          "missing-track",
          "This mode cannot create its target track",
          commands.find((command) => command.type === "ADD_NOTES")!,
        );
      }
      const trackIndex = this.document.ensureTrack(this.targetValue.trackKey);
      if (trackIndex === null) {
        throw new EditRejectedError(
          "missing-track",
          `Configured track '${this.targetValue.trackKey}' could not be created`,
          commands.find((command) => command.type === "ADD_NOTES")!,
        );
      }
      this.targetValue = { ...this.targetValue, trackIndex };
    }

    if (this.targetValue.trackIndex === null) return [...commands];
    return commands.map((command) => {
      if (command.type === "ADD_NOTES") {
        return {
          ...command,
          notes: command.notes.map((note) => ({
            ...note,
            trackIndex: this.targetValue.trackIndex!,
          })),
        };
      }
      if (materializesTarget && command.type === "ADD_TEXT") {
        return { ...command, trackIndex: this.targetValue.trackIndex! };
      }
      return command;
    });
  }

  private throwIfAllRejected(
    commands: readonly EditCommand[],
    expanded: readonly {
      commands: readonly RawCommand[];
      rejections: readonly Rejection[];
    }[],
    options: ExecuteOptions,
  ): void {
    if (
      options.throwOnReject &&
      expanded.every(
        (result) =>
          result.commands.length === 0 && result.rejections.length > 0,
      )
    ) {
      const rejection = expanded[0]!.rejections[0]!;
      throw new EditRejectedError(
        rejection.code,
        rejection.message,
        commands[0]!,
      );
    }
  }
}

class EditingGesture implements GestureHandle {
  private readonly session: EditingSessionImpl;
  private command: EditCommand | null = null;
  private open = true;

  public constructor(session: EditingSessionImpl) {
    this.session = session;
  }

  public get isOpen(): boolean {
    return this.open;
  }

  public preview(command: EditCommand): PreviewState {
    this.ensureOpen();
    this.command = command;
    return this.session.previewCommand(command);
  }

  public commit(): EditResult {
    this.ensureOpen();
    this.open = false;
    if (!this.command) return emptyEditResult();
    return this.session.execute(this.command);
  }

  public cancel(): void {
    this.ensureOpen();
    this.command = null;
    this.open = false;
  }

  private ensureOpen(): void {
    if (!this.open) throw new Error("Gesture is already closed");
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
