import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import {
  ViewportService,
  type ViewportSession,
} from "../../services/editor/viewports";

export class UpdateViewportAction extends Action<
  [string, Partial<Omit<ViewportSession, "id">>]
> {
  run(
    accessor: ServicesAccessor,
    id: string,
    update: Partial<Omit<ViewportSession, "id">>,
  ): void {
    accessor
      .get<ViewportService>("editor.viewports")
      .updateViewport(id, update);
  }
}
