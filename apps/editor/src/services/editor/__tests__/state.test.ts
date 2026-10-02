import { describe, expect, it, vi } from "vitest";
import { EditorStateService } from "../state";

describe("EditorStateService", () => {
  it("publishes dialog and error state changes", () => {
    const service = new EditorStateService();
    const listener = vi.fn();
    service.subscribe(listener);

    service.setProjectVisible(true);
    service.setError("Save failed");

    expect(service.getSnapshot()).toEqual({
      error: "Save failed",
      debugVisible: false,
      projectVisible: true,
      settingsVisible: false,
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
