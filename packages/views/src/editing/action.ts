import type { EditablePhraseKind } from "../chartEditing.js";

/** @deprecated Use RawCommand or a mode-specific EditCommand instead. */
export type ChartEditAction =
  | {
      type: "MOVE_NOTES";
      targetIds: string[];
      tickDelta: number;
      /** @deprecated Use pitchDelta. */
      trackDelta?: number;
      pitchDelta?: number;
    }
  | { type: "RESIZE_NOTES"; targetIds: string[]; durationDelta: number }
  | {
      type: "ADD_NOTE";
      tick: number;
      trackIndex: number;
      pitch: number;
      duration: number;
      velocity?: number;
    }
  | { type: "DELETE_SELECTION"; targetIds: string[] }
  | {
      type: "CREATE_PHRASE";
      trackIndex: number;
      startTick: number;
      duration: number;
      phraseType: EditablePhraseKind;
    }
  | {
      type: "RESIZE_PHRASE";
      targetId: string;
      startDelta: number;
      durationDelta: number;
    };
