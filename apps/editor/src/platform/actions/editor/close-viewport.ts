import { Action } from '../../actions';
import { ViewportService } from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

type TArgs = [id: string];
type TResult = boolean;
export class CloseViewportAction extends Action<TArgs, TResult> {
  constructor() {
    super({ condition: { 'editor.can-close-viewport': true } });
  }

  run(accessor: ServicesAccessor, id: string) {
    return accessor.get<ViewportService>('editor.viewports').closeViewport(id);
  }
}
