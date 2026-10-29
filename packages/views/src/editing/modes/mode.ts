import type { ZodType } from "zod";
import type { Difficulty } from "../../ruleset/difficulty";
import { RuleViolation } from "../../ruleset/context";
import type {
  CompiledRuleset,
  TrackDescriptor,
  RulesetContext,
} from "../../ruleset/index";
import type { ClipboardPayload } from "../clipboard";
import type { NoteSnapshot } from "../reader";
import type { EntityType } from "../entity";
import {
  DomainCommandType,
  EditCommandType,
  type EditCommand,
  type GeneralCommand,
} from "../commands";
import type { ChartDocumentReader } from "../reader";
import type { Rejection } from "../result";

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
  reader: ChartDocumentReader;
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

/** Track and difficulty selected by one viewport. */
export interface EditingTarget {
  trackKey: string;
  trackIndex: number | null;
  difficulty: Difficulty | null;
}

/** Commands and entities a mode allows its host view to edit. */
export interface ModeCapabilities {
  rawCommands: ReadonlySet<EditCommandType>;
  domainCommands: ReadonlySet<DomainCommandType>;
  entityKinds: ReadonlySet<EntityType>;
  canCreateTrack: boolean;
  requiresDifficulty: boolean;
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
  rowForNote(note: NoteSnapshot): ProjectionRow | null;
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

/** Pure descriptor for a track-specific editing mode. */
export interface EditingMode<TToolState = unknown> {
  readonly id: EditingModeId;
  readonly label: string;
  readonly hostKinds: ReadonlySet<string>;
  appliesTo(track: TrackDescriptor): boolean;
  readonly capabilities: ModeCapabilities;
  /** Tools depend on the target track's rules, so they are derived per context. */
  createTools(context: ModeContext): readonly ToolDescriptor[];
  readonly toolStateSchema: ZodType<TToolState>;
  createDefaultToolState(): TToolState;
  createProjection(context: ModeContext): Projection;
  classify(note: NoteSnapshot, context: ModeContext): EntityClassification;
  expandPaste(
    payload: ClipboardPayload,
    anchorTick: number,
    context: ModeContext,
    toolState: TToolState,
  ): ExpansionResult;
  expand(
    command: EditCommand,
    context: ModeContext,
    toolState: TToolState,
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
  register(mode: EditingMode): void;
  getById(modeId: EditingModeId): EditingMode | null;
  resolve(track: TrackDescriptor, hostKind: string): EditingMode | null;
  listForHost(hostKind: string): readonly EditingMode[];
  canHost(track: TrackDescriptor, hostKind: string): boolean;
}

/** Type guard for the raw command variants supported by the kernel. */
const rawCommandTypes: ReadonlySet<string> = new Set(
  Object.values(EditCommandType),
);

export function isRawCommand(command: EditCommand): command is GeneralCommand {
  return rawCommandTypes.has(command.type);
}
