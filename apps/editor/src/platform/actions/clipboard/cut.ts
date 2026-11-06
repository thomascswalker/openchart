import { Action } from '../../actions';
import { EditorClipboardService } from '../../services/editor/clipboard';
import type { ServicesAccessor } from '../../services/registry';

export class CutAction extends Action {
  constructor() {
    super({ condition: { 'clipboard.can-cut': true } });
  }

  run(accessor: ServicesAccessor): void {
    accessor.get<EditorClipboardService>('editor.clipboard').cut();
  }
}
