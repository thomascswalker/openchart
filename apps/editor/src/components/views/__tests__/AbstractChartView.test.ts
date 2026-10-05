import { describe, expect, it, vi } from "vitest";
import { AbstractChartView } from "../AbstractChartView";

class TestChartView extends AbstractChartView<never> {
  public cameraTick = 0;
  public visibleTickSpan = 960;

  protected draw(): void {}

  public getTrackNotes(): never[] {
    return [];
  }

  public emitCameraChange(): void {
    this.notifyCameraChange();
  }

  public override getCameraTick(): number {
    return this.cameraTick;
  }

  public override getVisibleTickSpan(): number {
    return this.visibleTickSpan;
  }
}

describe("AbstractChartView", () => {
  it("notifies all camera subscribers and removes listeners independently", () => {
    const view = new TestChartView();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = view.subscribeCameraChange(first);
    view.subscribeCameraChange(second);

    view.emitCameraChange();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    unsubscribeFirst();
    view.emitCameraChange();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);

    view.destroy();
    view.emitCameraChange();
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("uses the visible margin when framing a playhead", () => {
    const view = new TestChartView();

    expect(view.getCameraTickForPlayhead(480)).toBeNull();
    expect(view.getCameraTickForPlayhead(2_400)).toBe(2_304);

    view.cameraTick = 960;
    expect(view.getCameraTickForPlayhead(0)).toBe(0);
  });
});
