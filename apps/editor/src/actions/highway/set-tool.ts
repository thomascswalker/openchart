import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import {
  ViewportService,
  type HighwayToolMode,
} from "../../services/editor/viewports";
import { ActiveHighway } from "../conditions";

/** Selects a Highway tool (select, place, remove) in the active viewport. */
export class SetHighwayToolAction extends Action<[HighwayToolMode]> {
  constructor() {
    super({ condition: ActiveHighway });
  }

  run(accessor: ServicesAccessor, mode: HighwayToolMode): void {
    const viewports = accessor.get<ViewportService>("editor.viewports");
    const id = viewports.getActiveViewport()?.id;
    if (id) viewports.updateTools(id, { highwayMode: mode });
  }
}
