import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { EditorClipboardService } from "../../services/editor/clipboard";

export class CopyAction extends Action {
  constructor() {
    super({ condition: { "clipboard.can-copy": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorClipboardService>("editor.clipboard").copy();
  }
}
