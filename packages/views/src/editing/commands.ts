import type { TextMetaType } from "@openchart/midi";
import type { EntityId } from "./entityId.js";

/** Values needed to insert a note at an absolute tick. */
export interface NoteSpec {
  trackIndex: number;
  tick: number;
  pitch: number;
  duration: number;
  velocity?: number;
}

/** Absolute note-field changes addressed by a stable entity ID. */
export interface NotePatch {
  id: EntityId;
  tick?: number;
  pitch?: number;
  duration?: number;
  velocity?: number;
}

/** MIDI-level commands that can be applied directly by ChartDocument. */
export type RawCommand =
  | { type: "ADD_NOTES"; notes: readonly NoteSpec[] }
  | { type: "UPDATE_NOTES"; patches: readonly NotePatch[] }
  | {
      type: "MOVE_NOTES";
      targetIds: readonly EntityId[];
      tickDelta: number;
      pitchDelta: number;
    }
  | {
      type: "RESIZE_NOTES";
      targetIds: readonly EntityId[];
      durationDelta: number;
    }
  | { type: "DELETE_ENTITIES"; targetIds: readonly EntityId[] }
  | {
      type: "ADD_TEXT";
      trackIndex: number;
      metaType: TextMetaType;
      tick: number;
      text: string;
    }
  | { type: "UPDATE_TEXT"; id: EntityId; text?: string; tick?: number }
  | {
      type: "SET_TEMPO";
      tick: number;
      microsecondsPerQuarterNote: number;
    }
  | { type: "REMOVE_TEMPO"; tick: number }
  | {
      type: "SET_TIME_SIGNATURE";
      tick: number;
      numerator: number;
      denominator: number;
    }
  | { type: "REMOVE_TIME_SIGNATURE"; tick: number };

/** Discriminant of a raw MIDI-level command. */
export type RawCommandType = RawCommand["type"];

/** Opaque mode-specific command expanded into raw commands by a mode. */
export interface DomainCommand {
  readonly type: string;
  readonly [key: string]: unknown;
}

/** Command accepted by an editing session. */
export type EditCommand = RawCommand | DomainCommand;
