import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { ActiveChartViewService } from "../../services/editor/activeChartView";

/** Transposes the selected piano roll notes by a number of semitones. */
export class TransposeSelectionAction extends Action<[number]> {
  constructor() {
    super({ condition: { "viewport.active-view": "piano-roll" } });
  }

  run(accessor: ServicesAccessor, semitones: number): void {
    accessor
      .get<ActiveChartViewService>("editor.active-chart-view")
      .getActive("piano-roll")
      ?.transposeSelection(semitones);
  }
}
