import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import { useResizeObserver } from "usehooks-ts";
import type { AnyChartView } from "../../views/ChartViews";
import { drawTimeline } from "./util";

interface TimelineRenderOptions {
  chartViews: AnyChartView[];
  timelineTicks: number;
  playbackTick: number;
}

export const useTimelineRender = ({
  chartViews,
  timelineTicks,
  playbackTick,
}: TimelineRenderOptions) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubFrameRef = useRef<number | null>(null);

  const { width = 0, height = 0 } = useResizeObserver({
    ref: containerRef as RefObject<HTMLElement>,
    box: "border-box",
  });

  const redraw = useEffectEvent(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      drawTimeline(canvas, chartViews, timelineTicks, playbackTick);
    }
  });

  // Keep the canvas backing store in sync with the container size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    redraw();
  }, [width, height]);

  useEffect(() => {
    redraw();
  }, [chartViews, timelineTicks, playbackTick]);

  useEffect(() => {
    const unsubscribe = chartViews.map((chartView) =>
      chartView.subscribeCameraChange(() => redraw()),
    );
    return () => unsubscribe.forEach((dispose) => dispose());
  }, [chartViews]);

  useEffect(
    () => () => {
      if (scrubFrameRef.current !== null) {
        cancelAnimationFrame(scrubFrameRef.current);
      }
    },
    [],
  );

  return { canvasRef, containerRef, scrubFrameRef };
};
