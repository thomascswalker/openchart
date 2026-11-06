import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { EditorClipboardService } from "../../services/editor/clipboard";

export class CutAction extends Action {
  constructor() {
    super({ condition: { "clipboard.can-cut": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorClipboardService>("editor.clipboard").cut();
  }
}
