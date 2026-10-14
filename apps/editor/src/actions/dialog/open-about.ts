import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";

export class OpenAboutDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.about-open": false } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setAboutVisible(true);
  }
}
