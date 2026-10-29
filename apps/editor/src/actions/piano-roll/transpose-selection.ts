import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DomainCommandType, EditCommandType } from "@openchart/views";

import { parseSelectedNoteEntityIds } from "./util";

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
    if (!session) {
      return;
    }
    const targetIds = parseSelectedNoteEntityIds(
      session.selection.getSelectedIds(),
    );
    if (targetIds.length === 0) {
      return;
    }
    switch (session.mode.id) {
      case "midi.vocals":
        session.execute({
          type: DomainCommandType.MoveVocalEntities,
          targetIds,
          tickDelta: 0,
          pitchDelta: semitones,
          previousValidTickDelta: 0,
        });
        break;
      default:
        session.execute({
          type: EditCommandType.MoveNotes,
          targetIds,
          tickDelta: 0,
          pitchDelta: semitones,
        });
        break;
    }
  }
}
