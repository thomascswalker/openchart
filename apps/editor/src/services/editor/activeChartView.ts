import type { ChartView } from "../../components/views/ChartViews";
import { IStatefulService } from "../../platform/services";

export class ActiveChartViewService extends IStatefulService<ChartView | null> {
  private view: ChartView | null = null;
  private listeners = new Set<() => void>();

  public readonly reset = (): void => this.set(null);

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public readonly getSnapshot = (): ChartView | null => this.view;

  public readonly set = (view: ChartView | null): void => {
    if (view !== this.view) {
      this.view = view;
      this.notify();
    }
  };

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
