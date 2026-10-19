import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";

export class BeginOpenChartAction extends Action {
  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>("document").beginEdit();
  }
}
