import { describe, expect, it, vi } from "vitest";
import { ViewportService } from "../viewports";

describe("ViewportService", () => {
  it("owns viewport sessions and publishes focus and snap changes", () => {
    const service = new ViewportService();
    const listener = vi.fn();
    service.subscribe(listener);

    const id = service.addViewport("highway");
    expect(id).not.toBeNull();
    expect(service.getSnapshot().viewportSessions).toHaveLength(2);
    expect(service.getSnapshot().activeViewportId).toBe(id);

    service.focusViewport(id!);
    expect(listener).toHaveBeenCalledTimes(1);

    service.setSnapEnabled(false);
    service.setSnapDenominator(8);
    service.setLockCursor(true);
    expect(service.getSnapshot().snapEnabled).toBe(false);
    expect(service.getSnapshot().snapDenominator).toBe(8);
    expect(service.getSnapshot().lockCursor).toBe(true);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("forces the Piano Roll when Vocals is selected from any view", () => {
    const service = new ViewportService();
    const id = service.addViewport("highway")!;
    expect(service.getSnapshot().activeViewId).toBe("highway");

    // e.g. the Highway's instrument buttons.
    service.updateViewport(id, { instrument: "VOCALS", trackKey: "vocals" });
    expect(service.getViewport(id)?.view).toBe("piano-roll");
    expect(service.getSnapshot().activeViewId).toBe("piano-roll");

    // The Highway can't be selected while Vocals is the instrument.
    service.updateViewport(id, { view: "highway" });
    expect(service.getViewport(id)?.view).toBe("piano-roll");

    // Other instruments still switch freely.
    service.updateViewport(id, {
      instrument: "LEAD GUITAR",
      trackKey: "lead-guitar",
    });
    service.updateViewport(id, { view: "highway" });
    expect(service.getViewport(id)?.view).toBe("highway");
  });

  it("keeps camera-only updates from touching the active view id", () => {
    const service = new ViewportService();
    const id = service.getSnapshot().activeViewportId;
    service.setActiveView("custom");
    service.updateViewport(id, { camera: { tick: 480 } });
    expect(service.getSnapshot().activeViewId).toBe("custom");
    expect(service.getViewport(id)?.camera.tick).toBe(480);
  });
});
