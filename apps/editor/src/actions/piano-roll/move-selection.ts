import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { parseEntityId } from "@openchart/views";
import type { EditingService } from "../../services/editor/editing";
import { ViewportService } from "../../services/editor/viewports";

/** Moves selected piano roll notes through the active editing session. */
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
    if (!session || !viewport) return;
    const targetIds = session.selection
      .getSelectedIds()
      .filter((id) => parseEntityId(id)?.kind === "note");
    if (targetIds.length === 0) return;
    const viewportState = viewportService.getSnapshot();
    const delta = viewportState.snapEnabled
      ? Math.round(
          (editing.getDocument().getPpqn() * 4) / viewportState.snapDenominator,
        )
      : 8;
    session.execute(
      session.mode.id === "vocals"
        ? {
            type: "MOVE_VOCAL_ENTITIES",
            targetIds,
            tickDelta: direction * delta,
            pitchDelta: 0,
            previousValidTickDelta: 0,
          }
        : {
            type: "MOVE_NOTES",
            targetIds,
            tickDelta: direction * delta,
            pitchDelta: 0,
          },
    );
  }
}
