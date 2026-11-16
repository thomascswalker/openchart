import type { EditingModeId } from '@openchart/views';

import { Action } from '../../actions';
import { EditingService } from '../../services/editor/editing';
import type { ServicesAccessor } from '../../services/registry';

/** Updates one mode's viewport tool state. */
export class SetViewportToolsAction extends Action<
  [string, EditingModeId, Record<string, unknown>]
> {
  run(
    accessor: ServicesAccessor,
    id: string,
    modeId: EditingModeId,
    update: Record<string, unknown>,
  ): void {
    accessor
      .get<EditingService>('editor.editing')
      .updateToolState(id, modeId, update);
  }
}
