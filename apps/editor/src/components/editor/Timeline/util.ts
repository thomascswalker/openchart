import {
  MetaType,
  type TempoEvent,
  type TimeSignatureEvent,
  ticksToMs,
} from "@openchart/midi";
import type { AnyChartView } from "../../views/ChartViews";

export interface TimelinePosition {
  tick: string;
  time: string;
  measure: string;
}

const BackgroundColor = "#101010";
const ViewportColor = "rgba(255, 255, 255, 0.12)";
const ViewportBorderColor = "rgba(255, 255, 255, 0.35)";
const PlayheadColor = "#ff3b30";

export const DefaultTempoEvents: TempoEvent[] = [
  {
    deltaTime: 0,
    status: 0xff,
    type: MetaType.Tempo,
    length: 3,
    tick: 0,
    microsecondsPerQuarterNote: 500000,
  },
];

export const DefaultTimeSignatureEvents: TimeSignatureEvent[] = [];

function tickToX(tick: number, width: number, timelineTicks: number): number {
  if (timelineTicks <= 0) return 0;
  return (tick / timelineTicks) * width;
}
export function xToTick(
  x: number,
  width: number,
  timelineTicks: number,
): number {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(timelineTicks, (x / width) * timelineTicks));
}
export function drawTimeline(
  canvas: HTMLCanvasElement,
  chartViews: AnyChartView[],
  timelineTicks: number,
  playbackTick: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = BackgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (timelineTicks > 0) {
    for (const chartView of chartViews) {
      const cameraTick = chartView.getCameraTick();
      const visibleSpan = chartView.getVisibleTickSpan();

      const boxX = tickToX(cameraTick, width, timelineTicks);
      const boxWidth = Math.max(2, tickToX(visibleSpan, width, timelineTicks));

      ctx.fillStyle = ViewportColor;
      ctx.fillRect(boxX, 0, boxWidth, height);
      ctx.strokeStyle = ViewportBorderColor;
      ctx.strokeRect(boxX + 0.5, 0.5, boxWidth - 1, height - 1);
    }
  }

  const playheadX = tickToX(playbackTick, width, timelineTicks);
  ctx.strokeStyle = PlayheadColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, height);
  ctx.stroke();
}

function formatTime(milliseconds: number): string {
  const centiseconds = Math.floor(milliseconds / 10);
  const totalSeconds = Math.floor(centiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const fraction = String(centiseconds % 100).padStart(2, "0");
  const clock = [minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  return `${clock}.${fraction}`;
}

function formatMeasure(
  tick: number,
  ppqn: number,
  events: TimeSignatureEvent[],
): string {
  let measure = 1;
  let measureStart = 0;
  let numerator = 4;
  let denominatorExponent = 2;

  events.forEach((event) => {
    if (event.tick > tick) {
      return;
    }
    if (event.tick > measureStart) {
      const previousMeasureTicks =
        (ppqn * numerator * 4) / 2 ** denominatorExponent;
      measure += Math.ceil((event.tick - measureStart) / previousMeasureTicks);
      measureStart = event.tick;
    }

    numerator = event.numerator;
    denominatorExponent = event.denominator;
  });

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
  tempoEvents: TempoEvent[],
  timeSignatureEvents: TimeSignatureEvent[],
): TimelinePosition {
  return {
    tick: String(Math.floor(tick)),
    time: formatTime(ticksToMs(tick, ppqn, tempoEvents)),
    measure: formatMeasure(tick, ppqn, timeSignatureEvents),
  };
}
