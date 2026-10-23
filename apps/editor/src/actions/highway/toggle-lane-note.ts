import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";

/** Adds or removes the note in a lane (0-based) at the playhead. */
export class ToggleLaneNoteAction extends Action<[number, boolean?]> {
  constructor() {
    super({ condition: { "viewport.active-view": "highway" } });
  }

  run(accessor: ServicesAccessor, lane: number, preserveSustain = false): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getActive("highway")
      ?.toggleLaneNote(lane, preserveSustain);
  }
}
