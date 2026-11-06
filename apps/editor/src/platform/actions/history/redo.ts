import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { DocumentService } from "../../services/document/document";

export class RedoAction extends Action {
  constructor() {
    super({ condition: { "history.can-redo": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>("document").redoEdit();
  }
}
