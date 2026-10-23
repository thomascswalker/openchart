import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";

/** Moves selected piano roll notes one snap interval earlier/later. */
export class MoveSelectionAction extends Action<[-1 | 1]> {
  constructor() {
    super({ condition: { "viewport.active-view": "piano-roll" } });
  }

  run(accessor: ServicesAccessor, direction: -1 | 1): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getActive("piano-roll")
      ?.moveSelection(direction);
  }
}
