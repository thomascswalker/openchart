import { Action } from '../../actions';
import { EditorStateService } from '../../services/editor/state';
import type { ServicesAccessor } from '../../services/registry';

export class CloseSettingsDialogAction extends Action {
  constructor() {
    super({ condition: { 'dialog.settings-open': true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>('editor.state').setSettingsVisible(false);
  }
}
