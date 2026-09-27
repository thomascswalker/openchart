import { describe, expect, it } from "vitest";
import { snapToPreviousTimelineBoundary } from "./useTimeline";

describe("timeline snap pause", () => {
  it("snaps to the previous boundary when enabled", () => {
    expect(snapToPreviousTimelineBoundary(950, 480, 4, true)).toBe(480);
    expect(snapToPreviousTimelineBoundary(480, 480, 4, true)).toBe(480);
  });

  it("preserves the exact tick when snap is disabled", () => {
    expect(snapToPreviousTimelineBoundary(950, 480, 4, false)).toBe(950);
  });
});
