import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";

/** Closes the frontmost open dialog (About, Settings, Project, Debug). */
export class CloseTopmostDialogAction extends Action {
  constructor() {
    super({ condition: { "dialog.any-open": true } });
  }

  run(accessor: ServicesAccessor): void {
    const state = accessor.get<EditorStateService>("editor.state");
    const snapshot = state.getSnapshot();
    if (snapshot.aboutVisible) state.setAboutVisible(false);
    else if (snapshot.settingsVisible) state.setSettingsVisible(false);
    else if (snapshot.projectVisible) state.setProjectVisible(false);
    else if (snapshot.debugVisible) state.setDebugVisible(false);
  }
}
