import { Action } from '../../actions';
import type { ViewportKind } from '../../services/editor/viewports';
import { ViewportService } from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

export class AddViewportAction extends Action<
  [ViewportKind, afterId?: string],
  string | null
> {
  constructor() {
    super({ condition: { 'editor.can-add-viewport': true } });
  }

  run(
    accessor: ServicesAccessor,
    view: ViewportKind,
    afterId?: string,
  ): string | null {
    return accessor
      .get<ViewportService>('editor.viewports')
      .addViewport(view, afterId);
  }
}
