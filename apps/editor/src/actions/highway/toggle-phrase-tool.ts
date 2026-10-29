import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { DomainCommandType } from "@openchart/views";
import type { EditingService } from "../../services/editor/editing";
import { ViewportService } from "../../services/editor/viewports";
import { ActiveHighway } from "../conditions";

/**
 * Toggles a Highway phrase tool by phrase id (from the track's ruleset, e.g.
 * `stagePower` or `solo`); toggling the active one returns to Select.
 */
export class ToggleHighwayPhraseToolAction extends Action<[string]> {
  constructor() {
    super({
      condition: {
        ...ActiveHighway,
        [`editing.can.${DomainCommandType.CreatePhrase}`]: true,
      },
    });
  }

  run(accessor: ServicesAccessor, kind: string): void {
    const editing = accessor.get<EditingService>("editor.editing");
    const session = editing.getActiveSession();
    const viewport = accessor
      .get<ViewportService>("editor.viewports")
      .getActiveViewport();
    if (!session || !viewport) return;
    // Ignore phrases the current track does not offer (e.g. no solo on vocals).
    const offered = session
      .getTools()
      .some((tool) => tool.stateKey === "phrase" && tool.value === kind);
    if (!offered) return;
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
