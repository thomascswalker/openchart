import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useResizeObserver } from "usehooks-ts";
import { usePlaybackSelector } from "../../../hooks/usePlayback";
import { useDocumentSnapshot } from "../../../hooks/useDocumentSnapshot";
import styles from "./Timeline.module.css";
import {
  DefaultTempo,
  NoEvents,
  getTimelinePosition,
  drawTimeline,
} from "./util";
import type { AnyChartView } from "../../views/ChartViews";
import Controls from "./Controls";
import Viewport from "./Viewport";

interface TimelineProps {
  chartViews: AnyChartView[];
}

export function Timeline({ chartViews }: TimelineProps) {
  const isPlaying = usePlaybackSelector((s) => s.isPlaying);
  const playbackTick = usePlaybackSelector((s) => s.playbackTick);
  const totalTimelineTicks = usePlaybackSelector((s) => s.totalTimelineTicks);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubFrameRef = useRef<number | null>(null);

  const timelineTicks = Math.max(totalTimelineTicks, playbackTick);
  const doc = useDocumentSnapshot();
  const tempo = useMemo(
    () => doc.midi?.getTempoEvents() ?? DefaultTempo,
    [doc],
  );
  const sigs = useMemo(
    () => doc.midi?.getTimeSignatureEvents() ?? NoEvents,
    [doc],
  );
  const position = getTimelinePosition(
    playbackTick,
    doc.midi?.header.division ?? 480,
    tempo,
    sigs,
  );

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

  return (
    <div className={styles["timeline"]}>
      <Controls position={position} isPlaying={isPlaying} />
      <Viewport
        canvasRef={canvasRef}
        containerRef={containerRef}
        scrubFrameRef={scrubFrameRef}
        timelineTicks={timelineTicks}
        chartViews={chartViews}
        isPlaying={isPlaying}
      />
    </div>
  );
}
