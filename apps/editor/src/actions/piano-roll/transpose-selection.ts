import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { parseEntityId } from "@openchart/views";
import type { EditingService } from "../../services/editor/editing";

/** Transposes selected notes through the active editing session. */
export class TransposeSelectionAction extends Action<[number]> {
  constructor() {
    super({
      condition: {
        "viewport.active-view": "piano-roll",
        "editing.can.MOVE_SELECTION": true,
      },
    });
  }

  run(accessor: ServicesAccessor, semitones: number): void {
    const session = accessor
      .get<EditingService>("editor.editing")
      .getActiveSession();
    if (!session) return;
    const targetIds = selectedNoteIds(session.selection.getSelectedIds());
    if (targetIds.length === 0) return;
    const command =
      session.mode.id === "vocals"
        ? {
            type: "MOVE_VOCAL_ENTITIES",
            targetIds,
            tickDelta: 0,
            pitchDelta: semitones,
            previousValidTickDelta: 0,
          }
        : {
            type: "MOVE_NOTES",
            targetIds,
            tickDelta: 0,
            pitchDelta: semitones,
          };
    session.execute(command);
  }
}

function selectedNoteIds(ids: readonly string[]): string[] {
  return ids.filter((id) => parseEntityId(id)?.kind === "note");
}
