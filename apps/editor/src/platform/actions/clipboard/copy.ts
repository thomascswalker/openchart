import { Action } from '../../actions';
import { EditorClipboardService } from '../../services/editor/clipboard';
import type { ServicesAccessor } from '../../services/registry';

export class CopyAction extends Action {
  constructor() {
    super({ condition: { 'clipboard.can-copy': true } });
  }

  run(accessor: ServicesAccessor) {
    const clipboard = accessor.get<EditorClipboardService>('editor.clipboard');
    clipboard.copy();
  }
}
