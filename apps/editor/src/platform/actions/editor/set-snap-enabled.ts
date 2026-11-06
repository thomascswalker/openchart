import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { ViewportService } from "../../services/editor/viewports";

export class SetSnapEnabledAction extends Action<[boolean]> {
  run(accessor: ServicesAccessor, enabled: boolean): void {
    accessor.get<ViewportService>("editor.viewports").setSnapEnabled(enabled);
  }
}
