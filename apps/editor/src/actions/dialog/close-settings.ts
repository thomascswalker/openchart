import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";

export class CloseSettingsDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.settings-open": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setSettingsVisible(false);
  }
}
