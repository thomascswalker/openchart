import { Action } from '../../actions';
import { ViewportService } from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

export class SetSnapEnabledAction extends Action<[boolean]> {
  run(accessor: ServicesAccessor, enabled: boolean): void {
    accessor.get<ViewportService>('editor.viewports').setSnapEnabled(enabled);
  }
}
