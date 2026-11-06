import { Action } from '../../actions';
import { ActiveChartViewService } from '../../services/editor/activeChartView';
import type { ServicesAccessor } from '../../services/registry';

/** Clears the piano roll selection. */
export class ClearSelectionAction extends Action {
  constructor() {
    super({ condition: { 'viewport.active-view': 'piano-roll' } });
  }

  run(accessor: ServicesAccessor): void {
    accessor
      .get<ActiveChartViewService>('editor.active-chart-view')
      .getActive('piano-roll')
      ?.clearSelection();
  }
}
