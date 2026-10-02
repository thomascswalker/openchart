import { Action, type ActionOptions } from "../platform/commands";
import type { ServicesAccessor } from "../platform/services";
import type { DocumentService } from "../services/document";

const SaveFileDef: ActionOptions = {
  id: "global.action",
};

export class SaveFileAction extends Action {
  constructor() {
    super(SaveFileDef);
  }

  run(accessor: ServicesAccessor, ..._: any[]): void | Promise<void> {
    const doc = accessor.get<DocumentService>("IDocumentService");
    const result = doc.save();
    console.log(`[LOG]: ${result}`);
  }
}
