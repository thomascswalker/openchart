import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ViewportService } from "../../services/editor/viewports";

export class SetLockCursorAction extends Action<[boolean]> {
  constructor() {
    super({});
  }

  run(accessor: ServicesAccessor, locked: boolean): void {
    accessor.get<ViewportService>("editor.viewports").setLockCursor(locked);
  }
}
