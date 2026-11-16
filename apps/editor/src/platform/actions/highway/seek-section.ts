import { Action } from '../../actions';
import { ActiveChartViewService } from '../../services/editor/activeChartView';
import type { ServicesAccessor } from '../../services/registry';
import { ActiveHighway } from '../conditions';

/** Seeks to the next (1) or previous (-1) section marker. */
export class SeekSectionAction extends Action<[-1 | 1]> {
  constructor() {
    super({ condition: ActiveHighway });
  }

  run(accessor: ServicesAccessor, direction: -1 | 1): void {
    accessor
      .get<ActiveChartViewService>('editor.active-chart-view')
      .getActive('highway')
      ?.seekSection(direction);
  }
}
