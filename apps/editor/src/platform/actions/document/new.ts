import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { DocumentService } from "../../services/document/document";

export class NewDocumentAction extends Action {
  run(accessor: ServicesAccessor): void {
    const document = accessor.get<DocumentService>("document");
    if (
      document.isDirty &&
      !window.confirm(
        "This document has unsaved changes. Discard them and continue?",
      )
    ) {
      return;
    }
    document.reset();
  }
}
