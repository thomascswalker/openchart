import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";

export class CloseAboutDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.about-open": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setAboutVisible(false);
  }
}
