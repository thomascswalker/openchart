import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";

export class UndoAction extends Action {
  constructor() {
    super({ condition: { "history.can-undo": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>("document").undoEdit();
  }
}
