import { Action } from '../../actions';
import { EditorStateService } from '../../services/editor/state';
import type { ServicesAccessor } from '../../services/registry';

export class OpenAboutDialogAction extends Action {
  constructor() {
    super({ condition: { 'dialog.about-open': false } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorStateService>('editor.state').setAboutVisible(true);
  }
}
