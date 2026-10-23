import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";

/** Clears the piano roll selection. */
export class ClearSelectionAction extends Action {
  constructor() {
    super({ condition: { "viewport.active-view": "piano-roll" } });
  }

  run(accessor: ServicesAccessor): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getActive("piano-roll")
      ?.clearSelection();
  }
}
