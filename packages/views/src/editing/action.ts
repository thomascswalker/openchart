import type { EditablePhraseKind } from "../chartEditing.js";

export type ChartEditAction =
  | {
      type: "MOVE_NOTES";
      targetIds: string[];
      tickDelta: number;
      trackDelta: number;
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
