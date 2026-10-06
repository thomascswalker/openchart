import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import {
  ticksToMs,
  type Midi,
  type TempoChange,
  type TimeSignatureChange,
} from "@midiedit/core";
import type { ChartView } from "./views/ChartViews";
import { usePlaybackSelector } from "../hooks/usePlayback";
import { runAction } from "../actions/execute";
import { useDocumentSnapshot } from "../hooks/useDocumentSnapshot";

interface TimelineProps {
  chartView: ChartView | null;
  midiData: Midi | null;
}

const BACKGROUND_COLOR = "#101010";
const VIEWPORT_COLOR = "rgba(255, 255, 255, 0.12)";
const VIEWPORT_BORDER_COLOR = "rgba(255, 255, 255, 0.35)";
const PLAYHEAD_COLOR = "#ff3b30";
const DEFAULT_TEMPO: TempoChange[] = [
  { tick: 0, microsecondsPerQuarterNote: 500_000 },
];
const NO_CHANGES: TimeSignatureChange[] = [];

function tickToX(tick: number, width: number, timelineTicks: number): number {
  if (timelineTicks <= 0) return 0;
  return (tick / timelineTicks) * width;
}

function xToTick(x: number, width: number, timelineTicks: number): number {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(timelineTicks, (x / width) * timelineTicks));
}

function drawTimeline(
  canvas: HTMLCanvasElement,
  chartView: ChartView | null,
  timelineTicks: number,
  playbackTick: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);

  if (chartView && timelineTicks > 0) {
    const cameraTick = chartView.getCameraTick();
    const visibleSpan = chartView.getVisibleTickSpan();

    const boxX = tickToX(cameraTick, width, timelineTicks);
    const boxWidth = Math.max(2, tickToX(visibleSpan, width, timelineTicks));

    ctx.fillStyle = VIEWPORT_COLOR;
    ctx.fillRect(boxX, 0, boxWidth, height);
    ctx.strokeStyle = VIEWPORT_BORDER_COLOR;
    ctx.strokeRect(boxX + 0.5, 0.5, boxWidth - 1, height - 1);
  }

  const playheadX = tickToX(playbackTick, width, timelineTicks);
  ctx.strokeStyle = PLAYHEAD_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, height);
  ctx.stroke();
}

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

export function Timeline({ chartView }: TimelineProps) {
  const isPlaying = usePlaybackSelector((s) => s.isPlaying);
  const canPlay = usePlaybackSelector((s) => s.canPlay);
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
    () => doc.midiData?.getTempoChanges() ?? DEFAULT_TEMPO,
    [doc],
  );
  const sigs = useMemo(
    () => doc.midiData?.getTimeSignatureChanges() ?? NO_CHANGES,
    [doc],
  );
  const position = getTimelinePosition(
    playbackTick,
    doc.midiData?.header.division ?? 480,
    tempo,
    sigs,
  );

  const redraw = useEffectEvent(() => {
    const canvas = canvasRef.current;
    if (canvas) drawTimeline(canvas, chartView, timelineTicks, playbackTick);
  });

  useEffect(() => {
    redraw();
  }, [chartView, timelineTicks, playbackTick]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(width));
      const h = Math.max(1, Math.floor(height));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      redraw();
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!chartView) return;
    return chartView.subscribeCameraChange(() => redraw());
  }, [chartView]);

  const scrubToClientX = (clientX: number): void => {
    if (!canPlay || timelineTicks <= 0) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const tick = xToTick(clientX - bounds.left, bounds.width, timelineTicks);

    runAction("playback.set-tick", tick);

    if (chartView) {
      const cameraTick = chartView.getCameraTickForPlayhead(tick);
      if (cameraTick !== null) chartView.setCameraTick(cameraTick);
    }
  };

  const queueScrubToClientX = (clientX: number): void => {
    pendingScrubXRef.current = clientX;
    if (scrubFrameRef.current !== null) return;
    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = null;
      const pendingX = pendingScrubXRef.current;
      pendingScrubXRef.current = null;
      if (pendingX !== null) scrubToClientX(pendingX);
    });
  };

  const flushPendingScrub = (): void => {
    if (scrubFrameRef.current !== null) {
      cancelAnimationFrame(scrubFrameRef.current);
      scrubFrameRef.current = null;
    }
    const pendingX = pendingScrubXRef.current;
    pendingScrubXRef.current = null;
    if (pendingX !== null) scrubToClientX(pendingX);
  };

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
      runAction("playback.pause");
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
          onClick={() => runAction("playback.seek-start")}
          disabled={!canPlay || isPlaying}
          aria-label="Jump to Beginning"
        >
          ◀|
        </button>
        <button
          type="button"
          onClick={() => runAction("playback.toggle")}
          disabled={!canPlay}
          aria-label="Play/Pause"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => runAction("playback.seek-end")}
          disabled={!canPlay || isPlaying}
          aria-label="Jump to End"
        >
          |▶
        </button>
      </div>
      <div
        ref={containerRef}
        className="timeline__track"
        data-testid="viewport-timeline"
      >
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
