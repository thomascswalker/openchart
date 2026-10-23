import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";

/** Frames the selected piano roll notes in the viewport. */
export class FocusSelectionAction extends Action {
  constructor() {
    super({ condition: { "viewport.active-view": "piano-roll" } });
  }

  run(accessor: ServicesAccessor): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getActive("piano-roll")
      ?.focusSelection();
  }
}
