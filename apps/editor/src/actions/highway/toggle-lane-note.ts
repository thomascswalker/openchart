import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";
import { ActiveHighway } from "../conditions";

/** Adds or removes the note in a lane (0-based) at the playhead. */
export class ToggleLaneNoteAction extends Action<[number, boolean?]> {
  constructor() {
    super({ condition: ActiveHighway });
  }

  run(accessor: ServicesAccessor, lane: number, preserveSustain = false): void {
    const chartViewService = accessor.get<ActiveChartViewService>(
      "editor.active-chart-view",
    );
    const highwayView = chartViewService.getActive("highway");
    if (!highwayView) {
      return;
    }
    highwayView.toggleLaneNote(lane, preserveSustain);
  }
}
