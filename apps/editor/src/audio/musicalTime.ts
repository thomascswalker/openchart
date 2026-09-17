import {
  msToTicks,
  ticksToMs,
  type TempoChange,
  type TimeSignatureChange,
} from "@midiedit/core";

export interface BeatPosition {
  tick: number;
  measure: number;
  beat: number;
  isDownbeat: boolean;
}

const defaultTimeSignature: TimeSignatureChange = {
  tick: 0,
  numerator: 4,
  denominator: 2,
};

function normalizeTimeSignatures(
  changes: TimeSignatureChange[],
): TimeSignatureChange[] {
  const sorted = [...changes]
    .filter(
      (change) =>
        Number.isFinite(change.tick) &&
        Number.isFinite(change.numerator) &&
        Number.isFinite(change.denominator) &&
        change.numerator > 0,
    )
    .sort((a, b) => a.tick - b.tick);

  if (sorted.length === 0 || sorted[0].tick > 0) {
    sorted.unshift(defaultTimeSignature);
  }

  return sorted;
}

function signatureAtTick(
  tick: number,
  changes: TimeSignatureChange[],
): { change: TimeSignatureChange; index: number } {
  const normalized = normalizeTimeSignatures(changes);
  let index = 0;

  for (let candidate = 1; candidate < normalized.length; candidate++) {
    if (normalized[candidate].tick > tick) break;
    index = candidate;
  }

  return { change: normalized[index], index };
}

/** Number of ticks occupied by one beat for a MIDI time-signature exponent. */
export function ticksPerBeat(
  ppqn: number,
  signature: TimeSignatureChange,
): number {
  return ppqn * (4 / 2 ** signature.denominator);
}

/** Convert an absolute tick into measure/beat coordinates. */
export function tickToBeatPosition(
  tick: number,
  ppqn: number,
  changes: TimeSignatureChange[],
): BeatPosition {
  const safeTick = Math.max(0, tick);
  const normalized = normalizeTimeSignatures(changes);
  const { change, index } = signatureAtTick(safeTick, normalized);
  const beatLength = ticksPerBeat(ppqn, change);
  const measureLength = beatLength * change.numerator;
  const localTick = Math.max(0, safeTick - change.tick);
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
 * A time-signature change starts a new measure at its own tick.
 */
export function beatCrossings(
  fromTick: number,
  toTick: number,
  ppqn: number,
  changes: TimeSignatureChange[],
): BeatPosition[] {
  if (toTick < fromTick) return [];

  const normalized = normalizeTimeSignatures(changes);
  const result: BeatPosition[] = [];
  const epsilon = 1e-7;

  for (let index = 0; index < normalized.length; index++) {
    const change = normalized[index];
    const nextChange = normalized[index + 1]?.tick ?? Number.POSITIVE_INFINITY;
    const segmentStart = Math.max(change.tick, fromTick);
    const segmentEnd = Math.min(nextChange - epsilon, toTick);
    if (segmentStart > segmentEnd) continue;

    const beatLength = ticksPerBeat(ppqn, change);
    const firstBeat = Math.max(
      0,
      Math.ceil((segmentStart - change.tick - epsilon) / beatLength),
    );
    const lastBeat = Math.floor((segmentEnd - change.tick + epsilon) / beatLength);

    for (let beatIndex = firstBeat; beatIndex <= lastBeat; beatIndex++) {
      const tick = change.tick + beatIndex * beatLength;
      if (tick < fromTick - epsilon || tick > toTick + epsilon) continue;
      result.push({
        tick,
        measure: index + Math.floor(beatIndex / change.numerator),
        beat: beatIndex % change.numerator,
        isDownbeat: beatIndex % change.numerator === 0,
      });
    }
  }

  return result.sort((a, b) => a.tick - b.tick);
}

export function tickWindowForLookAhead(
  tick: number,
  lookAheadMs: number,
  ppqn: number,
  tempoChanges: TempoChange[],
): number {
  const currentMs = ticksToMs(tick, ppqn, tempoChanges);
  return msToTicks(currentMs + lookAheadMs, ppqn, tempoChanges);
}
