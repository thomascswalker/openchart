import { Action } from '../../actions';
import { ViewportService } from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

export class SetLockCursorAction extends Action<[boolean]> {
  run(accessor: ServicesAccessor, locked: boolean): void {
    accessor.get<ViewportService>('editor.viewports').setLockCursor(locked);
  }
}
