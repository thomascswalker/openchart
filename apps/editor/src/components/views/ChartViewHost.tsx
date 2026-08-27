import { useEffect, useRef } from "react";

import type { ChartViewState } from "./AbstractChartView";
import type { ChartView, ChartViewFactory } from "./ChartViews";

interface ChartViewHostProps {
  createRenderer: ChartViewFactory;
  state: ChartViewState;
}

export function ChartViewHost({ createRenderer, state }: ChartViewHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  const viewRef = useRef<ChartView | null>(null);
  const latestStateRef = useRef(state);

  latestStateRef.current = state;

  /*
   * Renderer lifecycle.
   *
   * This only runs when the visualization itself changes.
   * Changing tracks/MIDI does NOT recreate the renderer.
   */
  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const renderer = createRenderer();

    viewRef.current = renderer;

    const resizeRenderer = (): void => {
      const bounds = host.getBoundingClientRect();

      renderer.resize(
        Math.max(1, Math.floor(bounds.width)),
        Math.max(1, Math.floor(bounds.height)),
      );
    };

    const resizeObserver = new ResizeObserver(() => {
      resizeRenderer();
    });

    resizeObserver.observe(host);

    // Establish a size before the renderer finishes mounting.
    resizeRenderer();

    void renderer.mount(host).then(() => {
      renderer.update(latestStateRef.current);
    });

    return () => {
      resizeObserver.disconnect();

      if (viewRef.current === renderer) {
        viewRef.current = null;
      }

      renderer.destroy();
    };
  }, [createRenderer]);

  /*
   * Updating MIDI data or changing the selected track just updates
   * the existing renderer.
   */
  useEffect(() => {
    viewRef.current?.update(state);
  }, [state.midi, state.selectedTrackIndex]);

  return <div ref={hostRef} className="chart-view-host" />;
}
