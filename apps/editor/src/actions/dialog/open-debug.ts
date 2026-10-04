import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";

export class OpenDebugDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.debug-open": false } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setDebugVisible(true);
  }
}
