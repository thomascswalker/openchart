import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { WorkspaceService } from "../../services/workspace";
import { FileSystemDirectoryHandle } from "native-file-system-adapter";
export class OpenWorkspaceAction extends Action {
  constructor() {
    super();
  }

  async run(accessor: ServicesAccessor): Promise<void> {
    const workspace = accessor.get<WorkspaceService>("workspace");
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      await workspace.setDirectory(
        handle as unknown as FileSystemDirectoryHandle,
      );
    } catch (error) {
      // The user dismissing the picker is not an error.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
    }
  }
}
