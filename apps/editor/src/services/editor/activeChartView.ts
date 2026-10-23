import type { AnyChartView } from "../../components/views/ChartViews";
import { StatefulService } from "../../platform/services";

type ViewOfKind<K extends AnyChartView["kind"]> = Extract<
  AnyChartView,
  { kind: K }
>;

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

  /** The active view when it is of the given kind, otherwise null. */
  public getActive<K extends AnyChartView["kind"]>(
    kind: K,
  ): ViewOfKind<K> | null {
    const view = this._snapshot;
    return view?.kind === kind ? (view as ViewOfKind<K>) : null;
  }
}
