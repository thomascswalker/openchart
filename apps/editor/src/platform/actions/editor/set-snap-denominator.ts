import { Action } from '../../actions';
import { ViewportService } from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

export class SetSnapDenominatorAction extends Action<[number]> {
  run(accessor: ServicesAccessor, denominator: number): void {
    accessor
      .get<ViewportService>('editor.viewports')
      .setSnapDenominator(denominator);
  }
}
