import { Action } from '../../actions';
import type { ViewportKind } from '../../services/editor/viewports';
import { ViewportService } from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

type TArgs = [view: ViewportKind, afterId?: string];
type TResult = string | null;
export class AddViewportAction extends Action<TArgs, TResult> {
  constructor() {
    super({ condition: { 'editor.can-add-viewport': true } });
  }

  run(accessor: ServicesAccessor, view: ViewportKind, afterId?: string) {
    return accessor
      .get<ViewportService>('editor.viewports')
      .addViewport(view, afterId);
  }
}
