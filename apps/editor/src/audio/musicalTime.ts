import {
  msToTicks,
  ticksToMs,
  type TempoEvent,
  type TimeSignatureEvent,
} from "@openchart/core";

export interface BeatPosition {
  tick: number;
  measure: number;
  beat: number;
  isDownbeat: boolean;
}

const defaultTimeSignature: TimeSignatureEvent = {
  tick: 0,
  numerator: 4,
  denominator: 2,
};

function normalizeTimeSignatures(
  events: TimeSignatureEvent[],
): TimeSignatureEvent[] {
  const sorted = [...events]
    .filter(
      (event) =>
        Number.isFinite(event.tick) &&
        Number.isFinite(event.numerator) &&
        Number.isFinite(event.denominator) &&
        event.numerator > 0,
    )
    .sort((a, b) => a.tick - b.tick);

  if (sorted.length === 0 || sorted[0].tick > 0) {
    sorted.unshift(defaultTimeSignature);
  }

  return sorted;
}

function signatureAtTick(
  tick: number,
  events: TimeSignatureEvent[],
): { event: TimeSignatureEvent; index: number } {
  const normalized = normalizeTimeSignatures(events);
  let index = 0;

  for (let candidate = 1; candidate < normalized.length; candidate++) {
    if (normalized[candidate].tick > tick) break;
    index = candidate;
  }

  return { event: normalized[index], index };
}

/** Number of ticks occupied by one beat for a MIDI time-signature exponent. */
export function ticksPerBeat(
  ppqn: number,
  signature: TimeSignatureEvent,
): number {
  return ppqn * (4 / 2 ** signature.denominator);
}

/** Convert an absolute tick into measure/beat coordinates. */
export function tickToBeatPosition(
  tick: number,
  ppqn: number,
  events: TimeSignatureEvent[],
): BeatPosition {
  const safeTick = Math.max(0, tick);
  const normalized = normalizeTimeSignatures(events);
  const { event, index } = signatureAtTick(safeTick, normalized);
  const beatLength = ticksPerBeat(ppqn, event);
  const measureLength = beatLength * event.numerator;
  const localTick = Math.max(0, safeTick - event.tick);
  const measure = index + Math.floor(localTick / measureLength);
  const beat = Math.floor((localTick % measureLength) / beatLength);

  return {
    tick: safeTick,
    measure,
    beat,
    isDownbeat: beat === 0,
  };
}

/**
 * Return beat boundaries crossed by (fromTick, toTick]. A fresh playback
 * start may pass fromTick just below zero to include the beat at tick zero.
 * A time-signature event starts a new measure at its own tick.
 */
export function beatCrossings(
  fromTick: number,
  toTick: number,
  ppqn: number,
  events: TimeSignatureEvent[],
): BeatPosition[] {
  if (toTick < fromTick) return [];

  const normalized = normalizeTimeSignatures(events);
  const result: BeatPosition[] = [];
  const epsilon = 1e-7;

  for (let index = 0; index < normalized.length; index++) {
    const event = normalized[index];
    const nextEventTick =
      normalized[index + 1]?.tick ?? Number.POSITIVE_INFINITY;
    const segmentStart = Math.max(event.tick, fromTick);
    const segmentEnd = Math.min(nextEventTick, toTick);
    if (segmentStart > segmentEnd) continue;

    const beatLength = ticksPerBeat(ppqn, event);
    const firstBeat = Math.max(
      0,
      Math.ceil((segmentStart - event.tick - epsilon) / beatLength),
    );
    const lastBeat =
      Number.isFinite(nextEventTick) && segmentEnd >= nextEventTick
        ? Math.ceil((nextEventTick - event.tick) / beatLength) - 1
        : Math.floor((segmentEnd - event.tick + epsilon) / beatLength);

    for (let beatIndex = firstBeat; beatIndex <= lastBeat; beatIndex++) {
      const tick = event.tick + beatIndex * beatLength;
      if (tick < fromTick - epsilon || tick > toTick + epsilon) continue;
      result.push({
        tick,
        measure: index + Math.floor(beatIndex / event.numerator),
        beat: beatIndex % event.numerator,
        isDownbeat: beatIndex % event.numerator === 0,
      });
    }
  }

  return result.sort((a, b) => a.tick - b.tick);
}

export function tickWindowForLookAhead(
  tick: number,
  lookAheadMs: number,
  ppqn: number,
  tempoEvents: TempoEvent[],
): number {
  const currentMs = ticksToMs(tick, ppqn, tempoEvents);
  return msToTicks(currentMs + lookAheadMs, ppqn, tempoEvents);
}
