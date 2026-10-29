import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import {
  DomainCommandType,
  EditCommandType,
  EditingModeId,
} from "@openchart/views";
import { parseSelectedNoteEntityIds } from "./util";
import type { EditingService } from "../../services/editor/editing";
import { ViewportService } from "../../services/editor/viewports";

export class MoveSelectionAction extends Action<[-1 | 1]> {
  constructor() {
    super({
      condition: {
        "viewport.active-view": "piano-roll",
        "editing.can.MOVE_SELECTION": true,
      },
    });
  }

  run(accessor: ServicesAccessor, direction: -1 | 1): void {
    const editing = accessor.get<EditingService>("editor.editing");
    const session = editing.getActiveSession();
    const viewportService = accessor.get<ViewportService>("editor.viewports");
    const viewport = viewportService.getActiveViewport();
    if (!session || !viewport) {
      return;
    }

    // Extract the event IDs of the selected notes.
    const targetIds = parseSelectedNoteEntityIds(
      session.selection.getSelectedIds(),
    );
    if (targetIds.length === 0) {
      return;
    }
    const viewportState = viewportService.getSnapshot();

    const ppqn = session.getRulesContext().ppqn;
    const delta = viewportState.snapEnabled
      ? Math.round((ppqn * 4) / viewportState.snapDenominator)
      : 8;

    switch (session.mode.id) {
      case EditingModeId.MidiVocals:
        session.execute({
          type: DomainCommandType.MoveVocalEntities,
          targetIds,
          tickDelta: direction * delta,
          pitchDelta: 0,
          previousValidTickDelta: 0,
        });
        break;
      default:
        session.execute({
          type: EditCommandType.MoveNotes,
          targetIds,
          tickDelta: direction * delta,
          pitchDelta: 0,
        });
        break;
    }
  }
}
