import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { ViewportService } from "../../services/editor/viewports";

export class SetLockCursorAction extends Action<[boolean]> {
  run(accessor: ServicesAccessor, locked: boolean): void {
    accessor.get<ViewportService>("editor.viewports").setLockCursor(locked);
  }
}
