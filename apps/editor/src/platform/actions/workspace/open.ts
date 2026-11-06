import { Action } from '../../actions';
import type { ServicesAccessor } from '../../services/registry';
import type { WorkspaceService } from '../../services/workspace';

export class OpenWorkspaceAction extends Action {
  async run(accessor: ServicesAccessor) {
    const workspace = accessor.get<WorkspaceService>('workspace');
    await workspace.showSetDirectory();
  }
}
