import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import type { EntityId } from "@openchart/views";
import type { EditingService } from "../../services/editor/editing";

/** Deletes the active editing session's selected entities. */
export class DeleteSelectionAction extends Action {
  constructor() {
    super({ condition: { "editing.can.DELETE_ENTITIES": true } });
  }

  run(accessor: ServicesAccessor): void {
    const session = accessor
      .get<EditingService>("editor.editing")
      .getActiveSession();
    if (!session) return;
    const targetIds = session.selection.getSelectedIds() as EntityId[];
    if (targetIds.length === 0) return;
    const result = session.execute({ type: "DELETE_ENTITIES", targetIds });
    if (result.changed) {
      const removedIds = new Set<string>(result.removedIds);
      session.selection.setSelectedIds(
        session.selection
          .getSelectedIds()
          .filter((id) => !removedIds.has(id)) as EntityId[],
      );
    }
  }
}
