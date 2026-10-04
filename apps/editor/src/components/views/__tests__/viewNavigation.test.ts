import { describe, expect, it } from "vitest";
import { getCameraTickForPlayhead } from "../viewNavigation";

describe("chart-view playhead framing", () => {
  it("keeps a visible playhead at the current camera position", () => {
    expect(getCameraTickForPlayhead(480, 0, 960)).toBeNull();
  });

  it("places an out-of-view playhead at the follow margin", () => {
    expect(getCameraTickForPlayhead(2_400, 0, 960)).toBe(2_304);
  });

  it("never frames before the beginning of the chart", () => {
    expect(getCameraTickForPlayhead(0, 960, 960)).toBe(0);
  });
});
