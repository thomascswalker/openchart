import { Action } from '../../actions';
import { ViewportService } from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

export class CloseViewportAction extends Action<[string], boolean> {
  constructor() {
    super({ condition: { 'editor.can-close-viewport': true } });
  }

  run(accessor: ServicesAccessor, id: string): boolean {
    return accessor.get<ViewportService>('editor.viewports').closeViewport(id);
  }
}
