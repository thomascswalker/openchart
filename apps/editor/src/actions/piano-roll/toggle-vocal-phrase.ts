import { DomainCommandType, type VocalPhraseKind } from "@openchart/views";
import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import type { EditingService } from "../../services/editor/editing";
import { ViewportService } from "../../services/editor/viewports";

/** Toggles a vocal phrase tool in the active (vocals) piano roll viewport. */
export class ToggleVocalPhraseAction extends Action<[VocalPhraseKind]> {
  constructor() {
    super({
      condition: {
        "viewport.active-view": "piano-roll",
        "editing.mode": "midi.vocals",
        [`editing.can.${DomainCommandType.CreateVocalPhrase}`]: true,
      },
    });
  }

  run(accessor: ServicesAccessor, phrase: VocalPhraseKind): void {
    const editing = accessor.get<EditingService>("editor.editing");
    const session = editing.getActiveSession();
    const viewport = accessor
      .get<ViewportService>("editor.viewports")
      .getActiveViewport();
    if (!session || !viewport) return;
    const state = session.getToolState();
    const current = isRecord(state) ? state.phrase : null;
    editing.updateToolState(viewport.id, session.mode.id, {
      phrase: current === phrase ? null : phrase,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
