import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useResizeObserver } from "usehooks-ts";
import { usePlaybackSelector } from "../../../hooks/usePlayback";
import { runAction } from "../../../actions/execute";
import { useDocumentSnapshot } from "../../../hooks/useDocumentSnapshot";
import styles from "./Timeline.module.css";
import {
  DefaultTempo,
  NoEvents,
  getTimelinePosition,
  drawTimeline,
  xToTick,
} from "./util";
import type { AnyChartView } from "../../views/ChartViews";
import { Button } from "../../shared/Button";

interface TimelineProps {
  chartViews: AnyChartView[];
}

export function Timeline({ chartViews }: TimelineProps) {
  const isPlaying = usePlaybackSelector((s) => s.isPlaying);
  const playbackTick = usePlaybackSelector((s) => s.playbackTick);
  const totalTimelineTicks = usePlaybackSelector((s) => s.totalTimelineTicks);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const scrubFrameRef = useRef<number | null>(null);
  const pendingScrubXRef = useRef<number | null>(null);

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

  const Controls = () => {
    return (
      <div className={styles["timeline__controls"]}>
        <output className={styles["timeline__position"]}>
          <span className={styles["timeline__position-item"]}>
            <span className={styles["timeline__position-label"]}>TICK</span>
            <span>{position.tick}</span>
          </span>
          <span className={styles["timeline__position-item"]}>
            <span className={styles["timeline__position-label"]}>TIME</span>
            <span>{position.time}</span>
          </span>
          <span className={styles["timeline__position-item"]}>
            <span className={styles["timeline__position-label"]}>MEASURE</span>
            <span>{position.measure}</span>
          </span>
        </output>
        <Button
          onClick={() => runAction("playback.seek-start")}
          disabled={isPlaying}
        >
          ◀|
        </Button>
        <Button onClick={() => runAction("playback.toggle")}>
          {isPlaying ? "⏸" : "▶"}
        </Button>
        <Button
          onClick={() => runAction("playback.seek-end")}
          disabled={isPlaying}
        >
          |▶
        </Button>
      </div>
    );
  };

  const Track = () => {
    const scrubToClientX = (clientX: number): void => {
      if (timelineTicks <= 0) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      const tick = xToTick(clientX - bounds.left, bounds.width, timelineTicks);

      runAction("playback.set-tick", tick);

      for (const chartView of chartViews) {
        const cameraTick = chartView.getCameraTickForPlayhead(tick);
        if (cameraTick !== null) {
          chartView.setCameraTick(cameraTick);
        }
      }
    };

    const queueScrubToClientX = (clientX: number): void => {
      pendingScrubXRef.current = clientX;
      if (scrubFrameRef.current !== null) {
        return;
      }
      scrubFrameRef.current = requestAnimationFrame(() => {
        scrubFrameRef.current = null;
        const pendingX = pendingScrubXRef.current;
        pendingScrubXRef.current = null;
        if (pendingX !== null) {
          scrubToClientX(pendingX);
        }
      });
    };

    const flushPendingScrub = (): void => {
      if (scrubFrameRef.current !== null) {
        cancelAnimationFrame(scrubFrameRef.current);
        scrubFrameRef.current = null;
      }
      const pendingX = pendingScrubXRef.current;
      pendingScrubXRef.current = null;
      if (pendingX !== null) {
        scrubToClientX(pendingX);
      }
    };

    const handlePointerDown = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      draggingRef.current = true;

      if (isPlaying) {
        runAction("playback.pause");
      }

      queueScrubToClientX(event.clientX);
    };

    const handlePointerMove = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ) => {
      if (!draggingRef.current) {
        return;
      }

      queueScrubToClientX(event.clientX);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) {
        return;
      }

      pendingScrubXRef.current = event.clientX;
      flushPendingScrub();
      draggingRef.current = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
      <div
        ref={containerRef}
        className={styles["timeline__track"]}
        data-testid="viewport-timeline"
      >
        <canvas
          ref={canvasRef}
          className={styles["timeline__canvas"]}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
    );
  };

  return (
    <div className={styles["timeline"]}>
      <Controls />
      <Track />
    </div>
  );
}
