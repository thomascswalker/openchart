import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ViewportService } from "../../services/editor/viewports";

export class SetSnapDenominatorAction extends Action<[number]> {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor, denominator: number): void {
    accessor
      .get<ViewportService>("editor.viewports")
      .setSnapDenominator(denominator);
  }
}
