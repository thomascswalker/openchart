import { Action } from '../../actions';
import { EditorStateService } from '../../services/editor/state';
import type { ServicesAccessor } from '../../services/registry';

export class CloseAboutDialogAction extends Action {
  constructor() {
    super({ condition: { 'dialog.about-open': true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>('editor.state').setAboutVisible(false);
  }
}
