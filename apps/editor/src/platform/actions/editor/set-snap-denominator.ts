import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { ViewportService } from "../../services/editor/viewports";

export class SetSnapDenominatorAction extends Action<[number]> {
  run(accessor: ServicesAccessor, denominator: number): void {
    accessor
      .get<ViewportService>("editor.viewports")
      .setSnapDenominator(denominator);
  }
}
