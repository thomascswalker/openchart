import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";

export class NewDocumentAction extends Action {
  constructor() {
    super({});
  }

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
