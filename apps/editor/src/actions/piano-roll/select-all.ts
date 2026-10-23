import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";

/** Selects every note in the piano roll's current track. */
export class SelectAllAction extends Action {
  constructor() {
    super({ condition: { "viewport.active-view": "piano-roll" } });
  }

  run(accessor: ServicesAccessor): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getActive("piano-roll")
      ?.selectAll();
  }
}
