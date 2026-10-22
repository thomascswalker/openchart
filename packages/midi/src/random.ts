import { MetaType } from "./types.js";
import type { MidiTrack } from "./track.js";

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface AddRandomChannelEventsOptions {
  minPitch?: number;
  maxPitch?: number;
  length?: number;
}

/**
 * Appends `count` sequential random-pitch notes (channel events) to `track`.
 */
export function addRandomChannelEvents(
  track: MidiTrack,
  count: number,
  options: AddRandomChannelEventsOptions = {},
): void {
  const { minPitch = 50, maxPitch = 72, length = 480 } = options;
  let offset = 0;
  for (let i = 0; i < count; i++) {
    track.addNote(randomInt(minPitch, maxPitch), offset, 100, offset + length);
    offset += length;
  }
}

interface AddRandomMetaEventsOptions {
  tickSpacing?: number;
  tempoRange?: [number, number];
}

/**
 * Appends `count` random meta events (tempo, time signature, or text) to `track`.
 */
export function addRandomMetaEvents(
  track: MidiTrack,
  count: number,
  options: AddRandomMetaEventsOptions = {},
): void {
  const { tickSpacing = 120, tempoRange = [60, 180] } = options;

  for (let i = 0; i < count; i++) {
    const tick = i * tickSpacing;
    switch (randomInt(0, 2)) {
      case 0:
        track.addTempoEvent(tick, randomInt(tempoRange[0], tempoRange[1]));
        break;
      case 1:
        track.addTimeSignatureEvent(tick);
        break;
      default:
        track.addTextEvent(MetaType.TextMidiEvent, tick, "Text!");
        break;
    }
  }
}
