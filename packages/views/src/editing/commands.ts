import type { TextMetaType } from "@openchart/midi";
import type { EntityId } from "./entity";

/** Values needed to insert a note at an absolute tick. */
export interface InsertNoteOptions {
  trackIndex: number;
  tick: number;
  pitch: number;
  duration: number;
  velocity?: number;
}

/** Absolute note-field changes addressed by a stable entity ID. */
export interface UpdateNoteOptions {
  id: EntityId;
  tick?: number;
  pitch?: number;
  duration?: number;
  velocity?: number;
}

export enum EditCommandType {
  AddNotes = "ADD_NOTES",
  UpdateNotes = "UPDATE_NOTES",
  MoveNotes = "MOVE_NOTES",
  ResizeNotes = "RESIZE_NOTES",
  DeleteEntities = "DELETE_ENTITIES",
  AddText = "ADD_TEXT",
  UpdateText = "UPDATE_TEXT",
  SetTempo = "SET_TEMPO",
  RemoveTempo = "REMOVE_TEMPO",
  SetTimeSignature = "SET_TIME_SIGNATURE",
  RemoveTimeSignature = "REMOVE_TIME_SIGNATURE",
}

export enum DomainCommandType {
  PlaceChartNote = "PLACE_CHART_NOTE",
  MoveChartNotes = "MOVE_CHART_NOTES",
  SetSustainEnd = "SET_SUSTAIN_END",
  CutSustains = "CUT_SUSTAINS",
  CreatePhrase = "CREATE_PHRASE",
  UpdatePhrase = "UPDATE_PHRASE",
  PasteChartNotes = "PASTE_CHART_NOTES",
  AddVocalNote = "ADD_VOCAL_NOTE",
  SetLyric = "SET_LYRIC",
  MoveVocalEntities = "MOVE_VOCAL_ENTITIES",
  ResizeVocalEntities = "RESIZE_VOCAL_ENTITIES",
  CreateVocalPhrase = "CREATE_VOCAL_PHRASE",
  AddSection = "ADD_SECTION",
  PasteClipboard = "PASTE_CLIPBOARD",
}

export interface ICommand {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface DomainCommand extends ICommand {
  type: DomainCommandType;
}

export interface AddNotesCommand extends ICommand {
  type: EditCommandType.AddNotes;
  notes: readonly InsertNoteOptions[];
}

export interface UpdateNotesCommand extends ICommand {
  type: EditCommandType.UpdateNotes;
  patches: readonly UpdateNoteOptions[];
}

export interface MoveNotesCommand extends ICommand {
  type: EditCommandType.MoveNotes;
  targetIds: readonly EntityId[];
  tickDelta: number;
  pitchDelta: number;
}

export interface ResizeNotesCommand extends ICommand {
  type: EditCommandType.ResizeNotes;
  targetIds: readonly EntityId[];
  durationDelta: number;
}

export interface DeleteEntitiesCommand extends ICommand {
  type: EditCommandType.DeleteEntities;
  targetIds: readonly EntityId[];
}

export interface AddTextCommand extends ICommand {
  type: EditCommandType.AddText;
  trackIndex: number;
  metaType: TextMetaType;
  tick: number;
  text: string;
}

export interface UpdateTextCommand extends ICommand {
  type: EditCommandType.UpdateText;
  id: EntityId;
  text?: string;
  tick?: number;
}

export interface SetTempoCommand extends ICommand {
  type: EditCommandType.SetTempo;
  tick: number;
  microsecondsPerQuarterNote: number;
}

export interface RemoveTempoCommand extends ICommand {
  type: EditCommandType.RemoveTempo;
  tick: number;
}

export interface SetTimeSignatureCommand extends ICommand {
  type: EditCommandType.SetTimeSignature;
  tick: number;
  numerator: number;
  denominator: number;
}

export interface RemoveTimeSignatureCommand extends ICommand {
  type: EditCommandType.RemoveTimeSignature;
  tick: number;
}
export type GeneralCommand =
  | AddNotesCommand
  | UpdateNotesCommand
  | MoveNotesCommand
  | ResizeNotesCommand
  | DeleteEntitiesCommand
  | AddTextCommand
  | UpdateTextCommand
  | SetTempoCommand
  | RemoveTempoCommand
  | SetTimeSignatureCommand
  | RemoveTimeSignatureCommand;

/** Any command accepted by an editing mode before it is expanded to raw edits. */
export type EditCommand = GeneralCommand | DomainCommand;
