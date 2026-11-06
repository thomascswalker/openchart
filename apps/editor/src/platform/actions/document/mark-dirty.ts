import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { DocumentService } from "../../services/document/document";

export class MarkDocumentDirtyAction extends Action {
  run(accessor: ServicesAccessor): void {
    accessor.get<DocumentService>("document").isDirty = true;
  }
}
