import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";
import { ActiveHighway } from "../conditions";

/** Clears the Highway keyboard selection range. */
export class ClearSelectionAction extends Action {
  constructor() {
    super({ condition: ActiveHighway });
  }

  run(accessor: ServicesAccessor): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getActive("highway")
      ?.clearSelectionRange();
  }
}
