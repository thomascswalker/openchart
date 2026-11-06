import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { EditorStateService } from "../../services/editor/state";

export class CloseAboutDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.about-open": true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setAboutVisible(false);
  }
}
