import type { ZodType } from "zod";
import type { Difficulty } from "../chartView.js";
import type { SongViewConfig, TrackDescriptor } from "../config.js";
import type { ClipboardPayload } from "./clipboard.js";
import type { NoteSnapshot } from "./reader.js";
import type { EntityKind } from "./entityId.js";
import type { EditCommand, RawCommand, RawCommandType } from "./commands.js";
import type { ChartDocumentReader } from "./reader.js";
import type { Rejection } from "./result.js";

/** Stable identifier for a registered editing mode. */
export type EditingModeId =
  | "midi.raw"
  | "midi.global"
  | "chart.frets"
  | "chart.drums"
  | "vocals"
  | (string & {});

/** Document, target, and configuration visible to a pure editing mode. */
export interface ModeContext {
  reader: ChartDocumentReader;
  target: EditingTarget;
  config: SongViewConfig;
}

/** Track and difficulty selected by one viewport. */
export interface EditingTarget {
  trackKey: string;
  trackIndex: number | null;
  difficulty: Difficulty | null;
}

/** Commands and entities a mode allows its host view to edit. */
export interface ModeCapabilities {
  rawCommands: ReadonlySet<RawCommandType>;
  domainCommands: ReadonlySet<string>;
  entityKinds: ReadonlySet<EntityKind>;
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
  commands: readonly RawCommand[];
  rejections: readonly Rejection[];
}

/** Pure descriptor for a track-specific editing mode. */
export interface EditingMode<TToolState = unknown> {
  readonly id: EditingModeId;
  readonly label: string;
  readonly hostKinds: ReadonlySet<string>;
  appliesTo(track: TrackDescriptor): boolean;
  readonly capabilities: ModeCapabilities;
  readonly tools: readonly ToolDescriptor[];
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
  kind: EntityKind;
  subtype: string;
  movable: boolean;
  resizable: boolean;
}

/** Mode registry used to choose the first matching mode for a host and track. */
export interface ModeRegistry {
  register(mode: EditingMode): void;
  resolve(track: TrackDescriptor, hostKind: string): EditingMode | null;
  listForHost(hostKind: string): readonly EditingMode[];
  canHost(track: TrackDescriptor, hostKind: string): boolean;
}

/** Type guard for the raw command variants supported by the kernel. */
export function isRawCommand(command: EditCommand): command is RawCommand {
  return (
    command.type === "ADD_NOTES" ||
    command.type === "UPDATE_NOTES" ||
    command.type === "MOVE_NOTES" ||
    command.type === "RESIZE_NOTES" ||
    command.type === "DELETE_ENTITIES" ||
    command.type === "ADD_TEXT" ||
    command.type === "UPDATE_TEXT" ||
    command.type === "SET_TEMPO" ||
    command.type === "REMOVE_TEMPO" ||
    command.type === "SET_TIME_SIGNATURE" ||
    command.type === "REMOVE_TIME_SIGNATURE"
  );
}
