import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DocumentService } from "../../services/document";

export class SaveDocumentAction extends Action {
  constructor() {
    super({ condition: { "document.has-tracks": true } });
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const document = accessor.get<DocumentService>("document");
    await document.save();
  }
}
