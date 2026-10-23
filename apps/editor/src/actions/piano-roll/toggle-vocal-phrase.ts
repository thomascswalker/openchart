import type { VocalPhraseKind } from "@openchart/views";
import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ViewportService } from "../../services/editor/viewports";

/** Toggles a vocal phrase tool in the active (vocals) piano roll viewport. */
export class ToggleVocalPhraseAction extends Action<[VocalPhraseKind]> {
  constructor() {
    super({
      condition: {
        "viewport.active-view": "piano-roll",
        "viewport.vocals-editing": true,
      },
    });
  }

  run(accessor: ServicesAccessor, phrase: VocalPhraseKind): void {
    const viewports = accessor.get<ViewportService>("editor.viewports");
    const session = viewports.getActiveViewport();
    if (!session) return;
    const current = session.tools.vocal;
    viewports.updateTools(session.id, {
      vocal: {
        ...current,
        phrase: current.phrase === phrase ? null : phrase,
      },
    });
  }
}
