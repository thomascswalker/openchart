import type { ChartView } from "../../components/views/ChartViews";
import { StatefulService } from "../../platform/services";

export class ActiveChartViewService extends StatefulService<ChartView | null> {
  constructor() {
    super();
    this._snapshot = null;
  }

  public readonly reset = (): void => this.set(null);

  public readonly set = (view: ChartView | null): void => {
    if (view !== this._snapshot) {
      this._snapshot = view;
      this.notify();
    }
  };
}
