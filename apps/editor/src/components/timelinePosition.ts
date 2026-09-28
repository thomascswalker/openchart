import {
  ticksToMs,
  type TempoChange,
  type TimeSignatureChange,
} from "@midiedit/core";

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
