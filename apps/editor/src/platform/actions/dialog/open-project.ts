import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { EditorStateService } from "../../services/editor/state";

export class OpenProjectDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.project-open": false } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setProjectVisible(true);
  }
}
