import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Runtime } from "../Runtime";
import { Viewport } from "../Viewport";
import Platform from "../../platform";
import { PlaybackService } from "../../services/playback";

vi.mock("../Timeline", () => ({
  Timeline: () => null,
}));

vi.mock("../views/ChartViewHost", () => ({
  ChartViewHost: () => null,
}));

describe("viewport playback rendering", () => {
  it("does not commit the viewport panel for playback ticks alone", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    let commits = 0;

    try {
      act(() =>
        root.render(
          <Runtime>
            <Profiler id="viewport" onRender={() => commits++}>
              <Viewport />
            </Profiler>
          </Runtime>,
        ),
      );

      const initialCommits = commits;
      const playback = Platform.services.get<PlaybackService>("playback");
      act(() => playback.setPlaybackTick(120));
      act(() => playback.setPlaybackTick(240));
      act(() => playback.setPlaybackTick(360));

      expect(commits).toBe(initialCommits + 3);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
