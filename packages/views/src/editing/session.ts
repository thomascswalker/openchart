import {
  createRulesetContext,
  type RuleViolation,
  type RulesetContext,
  type CompiledRuleset,
} from "../ruleset/index.js";
import { validateRawCommands } from "./ruleValidation.js";
import type { ChartDocument } from "./chartDocument.js";
import type { EditCommand, RawCommand, RawCommandType } from "./commands.js";
import { computePreview, type PreviewState } from "./preview.js";
import {
  EditRejectedError,
  emptyEditResult,
  type EditResult,
  type Rejection,
} from "./result.js";
import { ClipboardService } from "./clipboard.js";
import type { SelectionModel } from "./selectionModel.js";
import { SelectionModel as SelectionModelImpl } from "./selectionModel.js";
import type {
  EditingMode,
  EditingTarget,
  ModeContext,
  Projection,
  ToolDescriptor,
} from "./mode.js";
import type { NoteSnapshot } from "./reader.js";

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
  /** The compiled ruleset this session edits under. */
  readonly rules: CompiledRuleset;
  readonly selection: SelectionModel;
  readonly clipboard: ClipboardService;
  getProjection(): Projection;
  /** Current inputs for rule evaluation (ppqn, project settings, player options). */
  getRulesContext(): RulesetContext;
  /** Toolbar tools for the current target; they depend on the track's rules. */
  getTools(): readonly ToolDescriptor[];
  classifyNote(note: NoteSnapshot): ReturnType<EditingMode["classify"]>;
  can(commandType: string): boolean;
  execute(command: EditCommand, options?: ExecuteOptions): EditResult;
  executeBatch(
    commands: readonly EditCommand[],
    options?: ExecuteOptions,
  ): EditResult;
  pasteClipboard(anchorTick: number): EditResult;
  beginGesture(): GestureHandle;
  getToolState(): unknown;
  setToolState(state: unknown): void;
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
  /** Compiled ruleset; drives mode behaviour and edit enforcement. */
  rules: CompiledRuleset;
  /**
   * Project settings and player options used to evaluate rules. A function is
   * re-read on every edit so settings changes take effect immediately.
   * Defaults to no settings, no player options and the document's ppqn.
   */
  rulesContext?: RulesetContext | (() => RulesetContext);
  transaction: EditTransactionPort;
  selection?: SelectionModel;
  clipboard?: ClipboardService;
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
  public readonly selection: SelectionModel;
  public readonly clipboard: ClipboardService;
  public readonly rules: CompiledRuleset;
  private readonly document: ChartDocument;
  private readonly rulesContextSource:
    RulesetContext | (() => RulesetContext) | undefined;
  private readonly transaction: EditTransactionPort;
  private readonly onCommit: ((result: EditResult) => void) | undefined;
  private targetValue: EditingTarget;
  private toolState: unknown;

  public constructor(options: CreateEditingSessionOptions) {
    this.document = options.document;
    this.mode = options.mode;
    this.targetValue = { ...options.target };
    this.hostKind = options.hostKind;
    this.rules = options.rules;
    this.rulesContextSource = options.rulesContext;
    this.transaction = options.transaction;
    this.selection = options.selection ?? new SelectionModelImpl();
    this.clipboard = options.clipboard ?? new ClipboardService();
    this.onCommit = options.onCommit;
    this.toolState = this.mode.toolStateSchema.parse(
      this.mode.createDefaultToolState(),
    );
  }

  public get target(): EditingTarget {
    return this.targetValue;
  }

  public setToolState(state: unknown): void {
    this.toolState = this.mode.toolStateSchema.parse(state);
  }

  public getProjection(): Projection {
    return this.mode.createProjection(this.createModeContext());
  }

  public classifyNote(note: NoteSnapshot): ReturnType<EditingMode["classify"]> {
    return this.mode.classify(note, this.createModeContext());
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

    const enforced = this.enforce(rawCommands);
    if (enforced.errors.length > 0) {
      const ruleRejections = this.toRejections(enforced.errors, commands[0]!);
      if (options.throwOnReject) {
        throw new EditRejectedError(
          ruleRejections[0]!.code,
          ruleRejections[0]!.message,
          commands[0]!,
        );
      }
      return {
        ...emptyEditResult(),
        rejections: [...rejections, ...ruleRejections],
        diagnostics: enforced.diagnostics,
      };
    }

    return this.commitExpanded(
      rawCommands,
      rejections,
      rawCommands[0]!,
      enforced.diagnostics,
    );
  }

  public pasteClipboard(anchorTick: number): EditResult {
    if (!Number.isSafeInteger(anchorTick) || anchorTick < 0) {
      throw new RangeError("anchorTick must be a non-negative integer");
    }
    const payload = this.clipboard.getData();
    if (!payload) return emptyEditResult();

    const expansion = this.mode.expandPaste(
      payload,
      anchorTick,
      this.createModeContext(),
      this.toolState,
    );
    if (expansion.commands.length === 0) {
      return { ...emptyEditResult(), rejections: [...expansion.rejections] };
    }

    const pasteCommand: EditCommand = { type: "PASTE_CLIPBOARD" };
    const enforced = this.enforce(expansion.commands);
    if (enforced.errors.length > 0) {
      return {
        ...emptyEditResult(),
        rejections: [
          ...expansion.rejections,
          ...this.toRejections(enforced.errors, pasteCommand),
        ],
        diagnostics: enforced.diagnostics,
      };
    }
    const result = this.commitExpanded(
      expansion.commands,
      expansion.rejections,
      pasteCommand,
      enforced.diagnostics,
    );
    if (result.createdIds.length > 0) {
      this.selection.setSelectedIds(result.createdIds);
    }
    return result;
  }

  private commitExpanded(
    rawCommands: readonly RawCommand[],
    rejections: readonly Rejection[],
    triggerCommand: EditCommand,
    diagnostics: readonly RuleViolation[] = [],
  ): EditResult {
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

      combinedResult = { ...result, rejections: [...rejections], diagnostics };
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
    const enforced = this.enforce(expansion.commands);
    return {
      ...preview,
      rejections: [
        ...expansion.rejections,
        ...preview.rejections,
        ...this.toRejections(enforced.errors, command),
      ],
      diagnostics: enforced.diagnostics,
    };
  }

  public getToolState(): unknown {
    return this.toolState;
  }

  public getTools(): readonly ToolDescriptor[] {
    return this.mode.createTools(this.createModeContext());
  }

  public getRulesContext(): RulesetContext {
    const source = this.rulesContextSource;
    if (typeof source === "function") return source();
    return source ?? createRulesetContext({ ppqn: this.document.getPpqn() });
  }

  private createModeContext(): ModeContext {
    const target = this.targetValue;
    const rulesContext = this.getRulesContext();
    return {
      reader: this.document,
      target,
      rules: this.rules,
      rulesContext,
      validate: (commands) =>
        validateRawCommands(
          commands,
          this.document,
          target,
          this.rules,
          rulesContext,
        ),
    };
  }

  /**
   * Runs the rule enforcer on expanded commands. `error` violations block the
   * edit; the rest are surfaced as diagnostics.
   */
  private enforce(commands: readonly RawCommand[]): {
    errors: RuleViolation[];
    diagnostics: RuleViolation[];
  } {
    const violations = this.createModeContext().validate(commands);
    return {
      errors: violations.filter((v) => v.severity === "error"),
      diagnostics: violations.filter((v) => v.severity !== "error"),
    };
  }

  private toRejections(
    errors: readonly RuleViolation[],
    command: EditCommand,
  ): Rejection[] {
    return errors.map((v) => ({
      code: `rule:${v.ruleId}`,
      message: v.message,
      command,
    }));
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
