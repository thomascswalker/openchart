import { useEffect, useRef } from "react";

import type { ChartViewState } from "./AbstractChartView";
import type { ChartView, ChartViewFactory } from "./ChartViews";

interface ChartViewHostProps {
  createRenderer: ChartViewFactory;
  state: ChartViewState;
  onSelectionChange?: (count: number) => void;
  /** Called with the mounted renderer instance, and again with null when it's torn down. */
  onReady?: (view: ChartView | null) => void;
}

export function ChartViewHost({
  createRenderer,
  state,
  onReady,
}: ChartViewHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  const viewRef = useRef<ChartView | null>(null);
  const latestStateRef = useRef(state);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

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
    lastSizeRef.current = null;

    const resizeRenderer = (): void => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      const lastSize = lastSizeRef.current;

      if (lastSize && lastSize.width === width && lastSize.height === height) {
        return;
      }

      lastSizeRef.current = { width, height };

      renderer.resize(width, height);
    };

    const resizeObserver = new ResizeObserver(() => {
      resizeRenderer();
    });

    resizeObserver.observe(host);

    // Establish a size before the renderer finishes mounting.
    resizeRenderer();

    void renderer.mount(host).then(() => {
      renderer.update(latestStateRef.current);
      onReadyRef.current?.(renderer);
    });

    return () => {
      resizeObserver.disconnect();

      if (viewRef.current === renderer) {
        viewRef.current = null;
      }

      onReadyRef.current?.(null);
      renderer.destroy();
    };
  }, [createRenderer]);

  /*
   * Updating MIDI data or changing the selected track just updates
   * the existing renderer.
   */
  useEffect(() => {
    viewRef.current?.update(state);
  }, [
    state.midi,
    state.selectedTrackIndex,
    state.selectedInstrument,
    state.selectedDifficulty,
    state.snap.enabled,
    state.snap.denominator,
  ]);

  return <div ref={hostRef} className="midi-view-host" />;
}
