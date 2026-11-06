import { Action } from '../../actions';
import { ViewportService } from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

export class FocusViewportAction extends Action<[string]> {
  run(accessor: ServicesAccessor, id: string): void {
    accessor.get<ViewportService>('editor.viewports').focusViewport(id);
  }
}
