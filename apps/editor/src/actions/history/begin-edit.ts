import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document/document";

export class BeginOpenChartAction extends Action {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>("document").beginOpenChart();
  }
}
