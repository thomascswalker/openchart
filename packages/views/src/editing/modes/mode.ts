import type { ZodType } from "zod";
import type { Difficulty } from "../../ruleset/difficulty";
import { RuleViolation } from "../../ruleset/context";
import type {
  CompiledRuleset,
  TrackDescriptor,
  RulesetContext,
  TrackRules,
  TrackKind,
} from "../../ruleset/index";
import type { ClipboardPayload } from "../clipboard";
import type { EntityId, NoteHandle } from "../entity";
import type { EntityType } from "../entity";
import {
  DomainCommandType,
  GeneralCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../commands";
import type { Rejection } from "../result";
import { CommandExecutor } from "../executor";

export const EditingModeId = {
  MidiRaw: "midi.raw",
  MidiGlobal: "midi.global",
  MidiVocals: "midi.vocals",
  ChartLanes: "chart.lanes",
} as const;

export type EditingModeId =
  (typeof EditingModeId)[keyof typeof EditingModeId] | (string & {});

/** Document, target, and configuration visible to a pure editing mode. */
export interface ModeContext {
  executor: CommandExecutor;
  target: EditingTarget;
  /** Compiled ruleset describing every track's lanes, phrases and rules. */
  rules: CompiledRuleset;
  /** Project settings, player options and ppqn used to evaluate rules. */
  rulesContext: RulesetContext;
  /**
   * Dry-run enforcement of raw commands against the ruleset. Lets a mode ask
   * "would this be accepted?" (e.g. to fall back to a previous valid offset).
   */
  validate(commands: readonly GeneralCommand[]): RuleViolation[];
}

/** Plain track/difficulty selection used to construct an {@link EditingTarget}. */
export interface IEditingTarget {
  trackKey: string;
  trackIndex: number | null;
  difficulty: Difficulty | null;
}

/** Track and difficulty selected by one viewport, bound to a document. */
export class EditingTarget implements IEditingTarget {
  public readonly trackKey: string;
  public readonly trackIndex: number | null;
  public readonly difficulty: Difficulty | null;
  private readonly executor: CommandExecutor;
  private readonly compiled: CompiledRuleset;

  public constructor(
    init: IEditingTarget,
    executor: CommandExecutor,
    compiled: CompiledRuleset,
  ) {
    this.trackKey = init.trackKey;
    this.trackIndex = init.trackIndex;
    this.difficulty = init.difficulty;
    this.executor = executor;
    this.compiled = compiled;
  }

  /** Returns a copy of this target with some fields replaced. */
  public with(changes: Partial<IEditingTarget>): EditingTarget {
    return new EditingTarget(
      {
        trackKey: this.trackKey,
        trackIndex: this.trackIndex,
        difficulty: this.difficulty,
        ...changes,
      },
      this.executor,
      this.compiled,
    );
  }

  /** Descriptor of the target track within the document, or null if unspecified. */
  public descriptor(): TrackDescriptor | null {
    const byIndex =
      this.trackIndex === null
        ? null
        : this.executor.getTrackDescriptorByTrackIndex(this.trackIndex);
    if (byIndex) return byIndex;
    return (
      this.compiled
        .descriptors()
        .find((track) => track.key === this.trackKey) ?? null
    );
  }

  /** Compiled rules of the target track within the document, or null if unspecified. */
  public rules(): TrackRules | null {
    return this.descriptor()?.rules ?? null;
  }

  /** Note handles of the target track within the document, or an empty array if unspecified. */
  public noteHandles(): readonly NoteHandle[] {
    return this.trackIndex === null
      ? []
      : this.executor.getNoteHandles(this.trackIndex);
  }

  /** Checks if the target track owns the specified note entities. */
  public ownsNoteEntities(
    ids: readonly (EntityId | string)[],
    command: EditCommand,
  ): { notes: NoteHandle[]; rejection: Rejection | null } {
    const notes: NoteHandle[] = [];
    for (const id of ids) {
      const note = this.executor.getHandleFromId(id);
      if (!note) {
        return {
          notes: [],
          rejection: this.rejection(
            command,
            "missing-note",
            `Note '${id}' does not exist`,
          ),
        };
      }
      if (this.trackIndex !== null && note.trackIndex !== this.trackIndex) {
        return {
          notes: [],
          rejection: this.rejection(
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

  public rejection(
    command: EditCommand,
    code: string,
    message: string,
  ): Rejection {
    return { command, code, message };
  }

  public rejected(
    command: EditCommand,
    code: string,
    message: string,
  ): ExpansionResult {
    return {
      commands: [],
      rejections: [this.rejection(command, code, message)],
    };
  }
}

/** Commands and entities a mode allows its host view to edit. */
export interface ModeCapabilities {
  generalCommands: ReadonlySet<GeneralCommandType>;
  domainCommands: ReadonlySet<DomainCommandType>;
  entityKinds: ReadonlySet<EntityType>;
  canCreateTrack: boolean;
  requiresDifficulty: boolean;
  trackKinds: ReadonlySet<TrackKind>;
}

/** Declarative toolbar tool metadata interpreted by the host application. */
export interface ToolDescriptor {
  id: string;
  label: string;
  icon: string;
  group: string;
  stateKey: string;
  value: unknown;
  toggle?: { offValue: unknown };
  shortcutActionId?: string;
  shortcutVariant?: string;
}

/** Mapping between a mode's visible rows and MIDI note pitches. */
export interface Projection {
  getRows(): readonly ProjectionRow[];
  rowForNote(note: NoteHandle): ProjectionRow | null;
  pitchForRow(row: ProjectionRow, toolState: unknown): number | null;
}

/** One view row exposed by a projection. */
export interface ProjectionRow {
  id: string;
  label: string;
  index: number;
  kind: string;
}

/** Raw commands and validation rejections produced by mode expansion. */
export interface ExpansionResult {
  commands: readonly GeneralCommand[];
  rejections: readonly Rejection[];
}

export type ExpanderFn = (
  mode: AbstractEditingMode,
  command: EditCommand,
  context: ModeContext,
  ...args: unknown[]
) => ExpansionResult;

/** Base class for a pure, track-specific editing mode. */
export abstract class AbstractEditingMode<TToolState = unknown> {
  public abstract readonly id: EditingModeId;
  public abstract readonly label: string;
  public abstract readonly hostKinds: ReadonlySet<string>;
  public abstract readonly capabilities: ModeCapabilities;
  public abstract readonly toolStateSchema: ZodType<TToolState>;
  public abstract appliesTo(track: TrackDescriptor): boolean;
  /** Tools depend on the target track's rules, so they are derived per context. */
  public abstract createTools(context: ModeContext): readonly ToolDescriptor[];
  public abstract createDefaultToolState(): TToolState;
  public abstract createProjection(context: ModeContext): Projection;
  public abstract classify(
    note: NoteHandle,
    context: ModeContext,
  ): EntityClassification;
  public abstract expandPaste(
    payload: ClipboardPayload,
    anchorTick: number,
    context: ModeContext,
    toolState: TToolState,
  ): ExpansionResult;
  public abstract expand(
    command: EditCommand,
    context: ModeContext,
    toolState: TToolState,
  ): ExpansionResult;
  /** Builds an expansion result containing only a rejection from this mode. */
  public abstract rejected(
    command: EditCommand,
    code: string,
    message: string,
  ): ExpansionResult;
}

/** Editing semantics assigned to a projected entity. */
export interface EntityClassification {
  type: EntityType;
  /** Compatibility alias for `type` used by older editing clients. */
  kind?: EntityType;
  subtype: string;
  movable: boolean;
  resizable: boolean;
}

/** Mode registry used to choose the first matching mode for a host and track. */
export interface ModeRegistry {
  register(mode: AbstractEditingMode): void;
  getById(modeId: EditingModeId): AbstractEditingMode | null;
  resolve(track: TrackDescriptor, hostKind: string): AbstractEditingMode | null;
  listForHost(hostKind: string): readonly AbstractEditingMode[];
  canHost(track: TrackDescriptor, hostKind: string): boolean;
}
