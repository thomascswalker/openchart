import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";

/** Seeks to the next (1) or previous (-1) section marker. */
export class SeekSectionAction extends Action<[-1 | 1]> {
  constructor() {
    super({ condition: { "viewport.active-view": "highway" } });
  }

  run(accessor: ServicesAccessor, direction: -1 | 1): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getActive("highway")
      ?.seekSection(direction);
  }
}
