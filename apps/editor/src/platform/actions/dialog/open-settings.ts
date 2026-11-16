import { Action } from '../../actions';
import { EditorStateService } from '../../services/editor/state';
import type { ServicesAccessor } from '../../services/registry';

export class OpenSettingsDialogAction extends Action {
  constructor() {
    super({ condition: { 'dialog.settings-open': false } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>('editor.state').setSettingsVisible(true);
  }
}
