import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Runtime } from "../Runtime";
import { Timeline } from "../Timeline";
import Platform from "../../platform";
import { PlaybackService } from "../../services/playback";

describe("timeline resize observer", () => {
  it.fails("keeps one ResizeObserver across playback ticks", async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    let constructions = 0;

    class CountingResizeObserver implements ResizeObserver {
      constructor(_callback: ResizeObserverCallback) {
        constructions++;
      }

      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    vi.stubGlobal("ResizeObserver", CountingResizeObserver);

    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);

    try {
      act(() =>
        root.render(
          <Runtime>
            <Timeline chartView={null} midiData={null} />
          </Runtime>,
        ),
      );
      await act(async () => {
        await Promise.resolve();
      });

      const initialConstructions = constructions;
      const playback = Platform.services.get<PlaybackService>("playback");
      act(() => playback.setPlaybackTick(120));
      act(() => playback.setPlaybackTick(240));
      act(() => playback.setPlaybackTick(360));

      expect(initialConstructions).toBe(1);
      expect(constructions).toBe(1);
    } finally {
      act(() => root.unmount());
      container.remove();
      vi.stubGlobal("ResizeObserver", originalResizeObserver);
    }
  });
});
