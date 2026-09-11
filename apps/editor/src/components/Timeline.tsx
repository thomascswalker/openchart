import { useCallback, useEffect, useRef } from "react";
import type { ChartView } from "./views/ChartViews";
import { usePlayback } from "../context/PlaybackContextStore";

interface TimelineProps {
  chartView: ChartView | null;
}

const BACKGROUND_COLOR = "#101010";
const VIEWPORT_COLOR = "rgba(255, 255, 255, 0.12)";
const VIEWPORT_BORDER_COLOR = "rgba(255, 255, 255, 0.35)";
const PLAYHEAD_COLOR = "#ff3b30";

export function Timeline({ chartView }: TimelineProps) {
  const {
    isPlaying,
    canPlay,
    playbackTick,
    totalTimelineTicks: totalTicks,
    play,
    pause,
    seekStart,
    seekEnd,
    setPlaybackTick: setPlayheadTick,
  } = usePlayback();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const redrawRef = useRef<() => void>(() => {});
  const timelineTicks = Math.max(totalTicks, playbackTick);

  const tickToX = useCallback(
    (tick: number, width: number): number => {
      if (timelineTicks <= 0) {
        return 0;
      }
      return (tick / timelineTicks) * width;
    },
    [timelineTicks],
  );

  const xToTick = useCallback(
    (x: number, width: number): number => {
      if (width <= 0) {
        return 0;
      }
      return Math.max(0, Math.min(timelineTicks, (x / width) * timelineTicks));
    },
    [timelineTicks],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);

    if (chartView && timelineTicks > 0) {
      const cameraTick = chartView.getCameraTick();
      const visibleSpan = chartView.getVisibleTickSpan();

      const boxX = tickToX(cameraTick, width);
      const boxWidth = Math.max(2, tickToX(visibleSpan, width));

      ctx.fillStyle = VIEWPORT_COLOR;
      ctx.fillRect(boxX, 0, boxWidth, height);
      ctx.strokeStyle = VIEWPORT_BORDER_COLOR;
      ctx.strokeRect(boxX + 0.5, 0.5, boxWidth - 1, height - 1);
    }

    const playheadX = tickToX(playbackTick, width);
    ctx.strokeStyle = PLAYHEAD_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }, [chartView, playbackTick, tickToX, timelineTicks]);

  redrawRef.current = draw;

  // Redraw whenever the piano roll's camera pans or zooms.
  useEffect(() => {
    if (!chartView) {
      return;
    }

    chartView.onCameraChange = () => {
      redrawRef.current();
    };

    return () => {
      chartView.onCameraChange = null;
    };
  }, [chartView]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      const bounds = container.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(bounds.width));
      canvas.height = Math.max(1, Math.floor(bounds.height));
      draw();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [draw]);

  const scrubToClientX = useCallback(
    (clientX: number) => {
      if (!canPlay || timelineTicks <= 0) {
        return;
      }

      const canvas = canvasRef.current;

      if (!canvas) {
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      const tick = xToTick(clientX - bounds.left, bounds.width);

      setPlayheadTick(tick);

      if (chartView) {
        const visibleSpan = chartView.getVisibleTickSpan();
        chartView.setCameraTick(Math.max(0, tick - visibleSpan / 2));
      }
    },
    [canPlay, chartView, setPlayheadTick, timelineTicks, xToTick],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;

    if (isPlaying) {
      pause();
    }

    scrubToClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) {
      return;
    }

    scrubToClientX(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="timeline">
      <div className="timeline__controls">
        <button
          type="button"
          onClick={seekStart}
          disabled={!canPlay || isPlaying}
          aria-label="Jump to Beginning"
        >
          ◀|
        </button>
        <button
          type="button"
          onClick={isPlaying ? pause : play}
          disabled={!canPlay || isPlaying}
          aria-label="Play/Pause"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={seekEnd}
          disabled={!canPlay || isPlaying}
          aria-label="Jump to End"
        >
          |▶
        </button>
      </div>
      <div ref={containerRef} className="timeline__track">
        <canvas
          ref={canvasRef}
          className="timeline__canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
    </div>
  );
}
