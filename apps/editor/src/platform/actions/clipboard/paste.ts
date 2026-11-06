import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { EditorClipboardService } from "../../services/editor/clipboard";

export class PasteAction extends Action {
  constructor() {
    super({ condition: { "clipboard.can-paste": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorClipboardService>("editor.clipboard").paste();
  }
}
