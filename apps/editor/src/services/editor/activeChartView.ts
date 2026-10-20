import type { AnyChartView } from "../../components/views/ChartViews";
import { StatefulService } from "../../platform/services";

export class ActiveChartViewService extends StatefulService<AnyChartView | null> {
  constructor() {
    super();
    this._snapshot = null;
  }

  public readonly reset = (): void => this.set(null);

  public readonly set = (view: AnyChartView | null): void => {
    if (view !== this._snapshot) {
      this._snapshot = view;
      this.notify();
    }
  };
}
