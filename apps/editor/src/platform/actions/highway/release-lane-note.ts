import { Action } from '../../actions';
import { ActiveChartViewService } from '../../services/editor/activeChartView';
import type { ServicesAccessor } from '../../services/registry';
import { ActiveHighway } from '../conditions';

/** Releases a held Highway lane note. */
export class ReleaseLaneNoteAction extends Action<[number]> {
  constructor() {
    super({ condition: ActiveHighway });
  }

  run(accessor: ServicesAccessor, lane: number): void {
    accessor
      .get<ActiveChartViewService>('editor.active-chart-view')
      .getActive('highway')
      ?.releaseLaneNote(lane);
  }
}
