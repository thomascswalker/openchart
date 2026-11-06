import { Action } from '../../actions';
import { EditorStateService } from '../../services/editor/state';
import type { ServicesAccessor } from '../../services/registry';

export class CloseProjectDialogAction extends Action {
  constructor() {
    super({ condition: { 'dialog.project-open': true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>('editor.state').setProjectVisible(false);
  }
}
