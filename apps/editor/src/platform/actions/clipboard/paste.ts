import { Action } from '../../actions';
import { EditorClipboardService } from '../../services/editor/clipboard';
import type { ServicesAccessor } from '../../services/registry';

export class PasteAction extends Action {
  constructor() {
    super({ condition: { 'clipboard.can-paste': true } });
  }

  run(accessor: ServicesAccessor) {
    const clipboard = accessor.get<EditorClipboardService>('editor.clipboard');
    clipboard.paste();
  }
}
