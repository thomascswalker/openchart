import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ViewportService } from "../../services/editor/viewports";
import { ActiveHighway } from "../conditions";

/** Toggles a Highway phrase tool; toggling the active one returns to Select. */
export class ToggleHighwayPhraseToolAction extends Action<
  ["stagepower" | "solo"]
> {
  constructor() {
    super({ condition: ActiveHighway });
  }

  run(accessor: ServicesAccessor, kind: "stagepower" | "solo"): void {
    const viewports = accessor.get<ViewportService>("editor.viewports");
    const session = viewports.getActiveViewport();
    if (!session) {
      return;
    }
    viewports.updateTools(session.id, {
      highwayMode: session.tools.highwayMode === kind ? "select" : kind,
    });
  }
}
