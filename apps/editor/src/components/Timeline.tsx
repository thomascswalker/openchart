import { useCallback, useEffect, useRef } from "react";
import {
  ticksToMs,
  type Midi,
  type TempoChange,
  type TimeSignatureChange,
} from "@midiedit/core";
import type { ChartView } from "./views/ChartViews";
import { HighwayView } from "./views/highway";
import { usePlayback } from "../hooks/usePlayback";
import { executeEditorAction } from "../actions/execute";

interface TimelineProps {
  chartView: ChartView | null;
  midiData: Midi | null;
}

const BACKGROUND_COLOR = "#101010";
const VIEWPORT_COLOR = "rgba(255, 255, 255, 0.12)";
const VIEWPORT_BORDER_COLOR = "rgba(255, 255, 255, 0.35)";
const PLAYHEAD_COLOR = "#ff3b30";

export interface TimelinePosition {
  tick: string;
  time: string;
  measure: string;
}

function formatTime(milliseconds: number): string {
  const centiseconds = Math.floor(milliseconds / 10);
  const totalSeconds = Math.floor(centiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const fraction = String(centiseconds % 100).padStart(2, "0");
  const clock = [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  return `${clock}.${fraction}`;
}

function formatMeasure(
  tick: number,
  ppqn: number,
  changes: TimeSignatureChange[],
): string {
  let measure = 1;
  let measureStart = 0;
  let numerator = 4;
  let denominatorExponent = 2;

  for (const change of changes) {
    if (change.tick > tick) break;
    if (change.tick > measureStart) {
      const previousMeasureTicks =
        (ppqn * numerator * 4) / 2 ** denominatorExponent;
      measure += Math.ceil((change.tick - measureStart) / previousMeasureTicks);
      measureStart = change.tick;
    }
    numerator = change.numerator;
    denominatorExponent = change.denominator;
  }

  const ticksPerQuarter = ppqn;
  const ticksPerMeasure =
    (ticksPerQuarter * numerator * 4) / 2 ** denominatorExponent;
  const elapsedTicks = tick - measureStart;
  const completedMeasures = Math.floor(elapsedTicks / ticksPerMeasure);
  const ticksWithinMeasure = elapsedTicks % ticksPerMeasure;
  const quarterBeat = Math.floor(ticksWithinMeasure / ticksPerQuarter) + 1;
  const fraction = Math.min(
    99,
    Math.floor(
      ((ticksWithinMeasure % ticksPerQuarter) / ticksPerQuarter) * 100,
    ),
  );

  measure += completedMeasures;
  return `${measure}.${quarterBeat}.${String(fraction).padStart(2, "0")}`;
}

export function getTimelinePosition(
  tick: number,
  ppqn: number,
  tempoChanges: TempoChange[],
  timeSignatureChanges: TimeSignatureChange[],
): TimelinePosition {
  return {
    tick: String(Math.floor(tick)),
    time: formatTime(ticksToMs(tick, ppqn, tempoChanges)),
    measure: formatMeasure(tick, ppqn, timeSignatureChanges),
  };
}

export function Timeline({ chartView, midiData }: TimelineProps) {
  const { isPlaying, canPlay, playbackTick, totalTimelineTicks } =
    usePlayback();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const scrubFrameRef = useRef<number | null>(null);
  const pendingScrubXRef = useRef<number | null>(null);

  const redrawRef = useRef<() => void>(() => {});
  const timelineTicks = Math.max(totalTimelineTicks, playbackTick);
  const position = getTimelinePosition(
    playbackTick,
    midiData?.header.division ?? 480,
    midiData?.getTempoChanges() ?? [
      { tick: 0, microsecondsPerQuarterNote: 500_000 },
    ],
    midiData?.getTimeSignatureChanges() ?? [],
  );

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

      void executeEditorAction("playback.set-tick", tick).catch(() => {});

      if (chartView) {
        if (chartView instanceof HighwayView) {
          chartView.setCameraTick(chartView.getCameraTickForPlayhead(tick));
        } else {
          const visibleSpan = chartView.getVisibleTickSpan();
          chartView.setCameraTick(Math.max(0, tick - visibleSpan / 2));
        }
      }
    },
    [canPlay, chartView, timelineTicks, xToTick],
  );

  const queueScrubToClientX = useCallback(
    (clientX: number): void => {
      pendingScrubXRef.current = clientX;
      if (scrubFrameRef.current !== null) return;
      scrubFrameRef.current = requestAnimationFrame(() => {
        scrubFrameRef.current = null;
        const pendingX = pendingScrubXRef.current;
        pendingScrubXRef.current = null;
        if (pendingX !== null) scrubToClientX(pendingX);
      });
    },
    [scrubToClientX],
  );

  const flushPendingScrub = useCallback((): void => {
    if (scrubFrameRef.current !== null) {
      cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
    }
    const pendingX = pendingScrubXRef.current;
    pendingScrubXRef.current = null;
    if (pendingX !== null) scrubToClientX(pendingX);
  }, [scrubToClientX]);

  useEffect(
    () => () => {
      if (scrubFrameRef.current !== null) {
        cancelAnimationFrame(scrubFrameRef.current);
      }
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;

    if (isPlaying) {
      void executeEditorAction("playback.pause").catch(() => {});
    }

    queueScrubToClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
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
    <div className="timeline">
      <div
        className="timeline__controls"
        role="toolbar"
        aria-label="Playback controls"
      >
        <output
          className="timeline__position"
          aria-label={`Playback position: tick ${position.tick}, time ${position.time}, measure ${position.measure}`}
        >
          <span className="timeline__position-item">
            <span className="timeline__position-label">TICK</span>
            <span>{position.tick}</span>
          </span>
          <span className="timeline__position-item">
            <span className="timeline__position-label">TIME</span>
            <span>{position.time}</span>
          </span>
          <span className="timeline__position-item">
            <span className="timeline__position-label">MEASURE</span>
            <span>{position.measure}</span>
          </span>
        </output>
        <button
          type="button"
          onClick={() =>
            void executeEditorAction("playback.seek-start").catch(() => {})
          }
          disabled={!canPlay || isPlaying}
          aria-label="Jump to Beginning"
        >
          ◀|
        </button>
        <button
          type="button"
          onClick={() =>
            void executeEditorAction("playback.toggle").catch(() => {})
          }
          disabled={!canPlay}
          aria-label="Play/Pause"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={() =>
            void executeEditorAction("playback.seek-end").catch(() => {})
          }
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
