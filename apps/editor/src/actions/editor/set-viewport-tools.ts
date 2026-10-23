import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import {
  ViewportService,
  type ViewportTools,
} from "../../services/editor/viewports";

/** Updates a viewport's editing tools (highway mode, placement kinds, ...). */
export class SetViewportToolsAction extends Action<
  [string, Partial<ViewportTools>]
> {
  run(
    accessor: ServicesAccessor,
    id: string,
    update: Partial<ViewportTools>,
  ): void {
    accessor.get<ViewportService>("editor.viewports").updateTools(id, update);
  }
}
