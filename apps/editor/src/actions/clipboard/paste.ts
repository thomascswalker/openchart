import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorClipboardService } from "../../services/editor/clipboard";

export class PasteAction extends Action {
  constructor() {
    super({ condition: { "clipboard.can-paste": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorClipboardService>("editor.clipboard").paste();
  }
}
