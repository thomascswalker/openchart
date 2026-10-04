import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";

export class OpenProjectDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.project-open": false } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>("editor.state").setProjectVisible(true);
  }
}
