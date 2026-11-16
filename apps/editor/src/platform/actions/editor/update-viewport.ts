import { Action } from '../../actions';
import {
  ViewportService,
  type ViewportSession,
} from '../../services/editor/viewports';
import type { ServicesAccessor } from '../../services/registry';

export class UpdateViewportAction extends Action<
  [string, Partial<Omit<ViewportSession, 'id'>>]
> {
  run(
    accessor: ServicesAccessor,
    id: string,
    update: Partial<Omit<ViewportSession, 'id'>>,
  ): void {
    accessor
      .get<ViewportService>('editor.viewports')
      .updateViewport(id, update);
  }
}
