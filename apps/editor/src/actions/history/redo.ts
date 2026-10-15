import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";

export class RedoAction extends Action {
  constructor() {
    super({ condition: { "history.can-redo": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>("document").redoEdit();
  }
}
