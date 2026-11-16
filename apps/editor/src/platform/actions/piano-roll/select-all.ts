import { Action } from '../../actions';
import { ActiveChartViewService } from '../../services/editor/activeChartView';
import type { ServicesAccessor } from '../../services/registry';

/** Selects every note in the piano roll's current track. */
export class SelectAllAction extends Action {
  constructor() {
    super({ condition: { 'viewport.active-view': 'piano-roll' } });
  }

  run(accessor: ServicesAccessor): void {
    accessor
      .get<ActiveChartViewService>('editor.active-chart-view')
      .getActive('piano-roll')
      ?.selectAll();
  }
}
