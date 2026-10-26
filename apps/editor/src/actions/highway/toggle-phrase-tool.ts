import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import type { EditingService } from "../../services/editor/editing";
import { ViewportService } from "../../services/editor/viewports";
import { ActiveHighway } from "../conditions";

/** Toggles a Highway phrase tool; toggling the active one returns to Select. */
export class ToggleHighwayPhraseToolAction extends Action<
  ["stagepower" | "solo"]
> {
  constructor() {
    super({
      condition: {
        ...ActiveHighway,
        "editing.can.CREATE_PHRASE": true,
      },
    });
  }

  run(accessor: ServicesAccessor, kind: "stagepower" | "solo"): void {
    const editing = accessor.get<EditingService>("editor.editing");
    const session = editing.getActiveSession();
    const viewport = accessor
      .get<ViewportService>("editor.viewports")
      .getActiveViewport();
    if (!session || !viewport) return;
    const state = session.getToolState();
    const phrase = isRecord(state) && state.phrase === kind ? null : kind;
    editing.updateToolState(viewport.id, session.mode.id, {
      tool: "select",
      phrase,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
