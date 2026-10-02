import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";

export class CloseDebugDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.debug-open": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setDebugVisible(false);
  }
}
