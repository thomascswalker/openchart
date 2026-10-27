import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import type { EditingService } from "../../services/editor/editing";
import { ViewportService } from "../../services/editor/viewports";
import { ActiveHighway } from "../conditions";

/** Selects a Highway tool (select, place, remove) in the active viewport. */
export class SetHighwayToolAction extends Action<
  ["select" | "place" | "remove"]
> {
  constructor() {
    super({
      condition: {
        ...ActiveHighway,
        "editing.can.PLACE_CHART_NOTE": true,
      },
    });
  }

  run(accessor: ServicesAccessor, tool: "select" | "place" | "remove"): void {
    const editing = accessor.get<EditingService>("editor.editing");
    const session = editing.getActiveSession();
    const viewport = accessor
      .get<ViewportService>("editor.viewports")
      .getActiveViewport();
    if (session && viewport) {
      const update: Record<string, unknown> = { tool };
      if (
        session.mode.tools.some(
          (descriptor) => descriptor.stateKey === "phrase",
        )
      ) {
        update.phrase = null;
      }
      editing.updateToolState(viewport.id, session.mode.id, {
        ...update,
      });
    }
  }
}
