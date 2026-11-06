import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { DocumentService } from "../../services/document/document";

export class UndoAction extends Action {
  constructor() {
    super({ condition: { "history.can-undo": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>("document").undoEdit();
  }
}
