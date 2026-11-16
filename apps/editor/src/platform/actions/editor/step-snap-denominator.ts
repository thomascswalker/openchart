import { getHighwaySnapDenominator } from '../../../components/views/highway/interactionMath';
import { SnapDenominators } from '../../../components/views/pianoRoll/constants';
import { Action } from '../../actions';
import { ViewportService } from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

/** Moves the snap interval to the next finer (1) or coarser (-1) choice. */
export class StepSnapDenominatorAction extends Action<[-1 | 1]> {
  run(accessor: ServicesAccessor, direction: -1 | 1): void {
    const viewports = accessor.get<ViewportService>('editor.viewports');
    viewports.setSnapDenominator(
      getHighwaySnapDenominator(
        viewports.getSnapshot().snapDenominator,
        direction,
        SnapDenominators,
      ),
    );
  }
}
