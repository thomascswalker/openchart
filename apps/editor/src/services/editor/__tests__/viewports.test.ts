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

    service.setSnapEnabled(false);
    service.setSnapDenominator(8);
    expect(service.getSnapshot().snapEnabled).toBe(false);
    expect(service.getSnapshot().snapDenominator).toBe(8);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
