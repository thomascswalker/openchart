import { Action, type ActionOptions } from "../platform/actions";
import type { ServicesAccessor } from "../platform/services";
import type { DocumentService } from "../services/document";

const SaveFileDef: ActionOptions = {
  id: "document.saveFile",
};

export class SaveFileAction extends Action {
  constructor() {
    super(SaveFileDef);
  }

  run(accessor: ServicesAccessor): void | Promise<void> {
    const doc = accessor.get<DocumentService>("global.document");
    const result = doc.save();
    console.log(`[LOG]: ${result}`);
  }
}
