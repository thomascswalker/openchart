import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";

/** Deletes the active chart view's selection. */
export class DeleteSelectionAction extends Action {
  run(accessor: ServicesAccessor): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getSnapshot()
      ?.deleteSelection();
  }
}
