import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";
import { ActiveHighway } from "../conditions";

/** Moves the playhead one step forward (1) or backward (-1). */
export class StepPlayheadAction extends Action<[-1 | 1, boolean?]> {
  constructor() {
    super({
      condition: ActiveHighway,
    });
  }

  run(
    accessor: ServicesAccessor,
    direction: -1 | 1,
    extendSelection = false,
  ): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getActive("highway")
      ?.stepPlayhead(direction, extendSelection);
  }
}
