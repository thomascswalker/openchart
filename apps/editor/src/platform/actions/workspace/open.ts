import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import type { WorkspaceService } from "../../services/workspace";

export class OpenWorkspaceAction extends Action {
  constructor() {
    super();
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const workspace = accessor.get<WorkspaceService>("workspace");
    workspace.showSetDirectory();
  }
}
