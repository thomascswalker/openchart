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
    const chartView = accessor.get<ActiveChartViewService>(
      "editor.active-chart-view",
    );
    const activeView = chartView.getActive("highway");
    if (!activeView) {
      return;
    }
    activeView.clearSelectionRange();
    activeView.clearSelectionContext();
  }
}
