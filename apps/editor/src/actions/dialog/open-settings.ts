import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";

export class OpenSettingsDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.settings-open": false } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setSettingsVisible(true);
  }
}
