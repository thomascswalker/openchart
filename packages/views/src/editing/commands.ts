import type { TextMetaType } from "@openchart/midi";
import type { EditablePhraseKind } from "../chartEditing.js";
import type { ChartEditAction } from "./action.js";
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

/** Context needed to upgrade legacy phrase commands without guessing. */
export interface LegacyActionUpgradeContext {
  resolvePhrasePitch(
    trackIndex: number,
    phraseType: EditablePhraseKind,
  ): number | null;
  getNote(id: string): {
    tick: number;
    pitch: number;
    duration: number;
  } | null;
}

/** Converts a deprecated action into the equivalent raw command. */
export function upgradeLegacyAction(
  action: ChartEditAction,
  context?: LegacyActionUpgradeContext,
): RawCommand {
  switch (action.type) {
    case "MOVE_NOTES":
      return {
        type: "MOVE_NOTES",
        targetIds: action.targetIds as EntityId[],
        tickDelta: action.tickDelta,
        pitchDelta: action.pitchDelta ?? action.trackDelta ?? 0,
      };
    case "RESIZE_NOTES":
      return {
        type: "RESIZE_NOTES",
        targetIds: action.targetIds as EntityId[],
        durationDelta: action.durationDelta,
      };
    case "ADD_NOTE":
      return {
        type: "ADD_NOTES",
        notes: [
          {
            trackIndex: action.trackIndex,
            tick: action.tick,
            pitch: action.pitch,
            duration: action.duration,
            velocity: action.velocity,
          },
        ],
      };
    case "DELETE_SELECTION":
      return {
        type: "DELETE_ENTITIES",
        targetIds: action.targetIds as EntityId[],
      };
    case "CREATE_PHRASE": {
      if (!context) {
        throw new Error("Phrase upgrades require a phrase-pitch resolver");
      }
      const pitch = context.resolvePhrasePitch(
        action.trackIndex,
        action.phraseType,
      );
      if (pitch === null) {
        throw new RangeError(
          `No MIDI pitch is configured for phrase type '${action.phraseType}' on track ${action.trackIndex}`,
        );
      }
      return {
        type: "ADD_NOTES",
        notes: [
          {
            trackIndex: action.trackIndex,
            tick: action.startTick,
            pitch,
            duration: action.duration,
          },
        ],
      };
    }
    case "RESIZE_PHRASE": {
      if (!context) {
        throw new Error("Phrase upgrades require a chart-document reader");
      }
      const note = context.getNote(action.targetId);
      if (!note) {
        return { type: "UPDATE_NOTES", patches: [] };
      }
      return {
        type: "UPDATE_NOTES",
        patches: [
          {
            id: action.targetId as EntityId,
            tick: note.tick + action.startDelta,
            duration: note.duration + action.durationDelta,
          },
        ],
      };
    }
  }
}
