import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ViewportService } from "../../services/editor/viewports";

export class CloseViewportAction extends Action<[string], boolean> {
  constructor() {
    super({ condition: { "editor.can-close-viewport": true } });
  }

  run(accessor: ServicesAccessor, id: string): boolean {
    return accessor.get<ViewportService>("editor.viewports").closeViewport(id);
  }
}
