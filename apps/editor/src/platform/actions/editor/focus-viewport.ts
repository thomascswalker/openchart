import { Action } from "../../actions";
import type { ServicesAccessor } from "../../services";
import { ViewportService } from "../../services/editor/viewports";

export class FocusViewportAction extends Action<[string]> {
  run(accessor: ServicesAccessor, id: string): void {
    accessor.get<ViewportService>("editor.viewports").focusViewport(id);
  }
}
