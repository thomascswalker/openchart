import { Midi } from "@midiedit/core";
import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { createProjectMetadata } from "../../project/projectMetadata";
import { DocumentService } from "../../services/document";

export class NewDocumentAction extends Action {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor): void {
    const document = accessor.get<DocumentService>("document");
    if (
      document.isDirty() &&
      !window.confirm(
        "This document has unsaved changes. Discard them and continue?",
      )
    ) {
      return;
    }
    document.setMidiData(new Midi());
    document.setProjectMetadata(createProjectMetadata());
    document.setFileName(null);
    document.setFileHandle(null);
    document.setClean();
  }
}
