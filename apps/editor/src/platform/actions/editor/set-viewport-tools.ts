import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import type { EditingModeId } from "@openchart/views";
import { EditingService } from "../../services/editor/editing";

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
      .get<EditingService>("editor.editing")
      .updateToolState(id, modeId, update);
  }
}
