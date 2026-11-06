import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { EditorStateService } from "../../services/editor/state";

export class OpenAboutDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.about-open": false } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setAboutVisible(true);
  }
}
