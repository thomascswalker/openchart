import { TempoEvent } from "./types.js";
import { startCase } from "es-toolkit";

/** The fields of a tempo change that time conversion needs. */
type TempoChange = Pick<TempoEvent, "tick" | "microsecondsPerQuarterNote">;

/**
 * Determines the length of a MIDI message based on its status byte.
 * @param status The status byte of the MIDI message
 * @returns The total length of the MIDI message in bytes, including the status
 * byte and data bytes
 */
export function getMessageLength(status: number): number {
  // System messages have variable lengths, but at least 1 byte for the
  // status
  if (status >= 0xf0) {
    return 1;
  }
  const type = status & 0xf0;

  // Program Change and Channel Pressure have 1 data byte
  if (type === 0xc0 || type === 0xd0) {
    return 2;
  }

  // All other channel messages have >=2 data bytes
  return 3;
}

/**
 * Determines if a MIDI message has two data bytes based on its status byte.
 * @param status The status byte of the MIDI message
 * @returns True if the message has two data bytes, false otherwise
 */
export function isTwoByteMessage(status: number): boolean {
  return getMessageLength(status) === 3;
}

export enum StatusNames {
  NoteOff = 0x80,
  NoteOn = 0x90,
  PolyphonicKeyPressure = 0xa0,
  ControlChange = 0xb0,
  ProgramChange = 0xc0,
  ChannelPressure = 0xd0,
  PitchBend = 0xe0,
  SysExStart = 0xf0,
  Start = 0xfa,
  Continue = 0xfb,
  Stop = 0xfc,
  SysExEnd = 0xf7,
  TimingClock = 0xf8,
  Meta = 0xff,
}

/**
 * Returns the string representation of the MIDI status byte.
 * @param status The status byte of the MIDI message
 * @returns A string describing the status, e.g., "Note On" or "System Message"
 */
export function getStatusString(status: number): string {
  const type = status & 0xff;
  if (StatusNames[type] !== undefined) {
    return startCase(StatusNames[type]);
  }
  return type >= 0xf0 ? "System Message" : "Unknown";
}

/**
 * Converts an absolute MIDI tick to milliseconds
 *
 * @param tick The absolute MIDI tick to convert
 * @param ppqn Pulses (ticks) per quarter note
 * @param tempoEvents Tempo events affecting the timing, sorted by tick
 * @returns The corresponding time in milliseconds
 */
export function ticksToMs(
  tick: number,
  ppqn: number,
  tempoEvents: readonly TempoChange[],
): number {
  let ms = 0;
  let previousTick = 0;
  let usPerQuarterNote = 500000; // 120BPM

  // Iterate through each tempo event to accumulate the time in milliseconds up
  // to the target tick
  for (const event of tempoEvents) {
    if (event.tick >= tick) {
      break;
    }

    // Calculate the time in milliseconds for the delta ticks since the previous
    // tempo event
    const delta = event.tick - previousTick;

    // Accumulate the time in milliseconds for this segment
    ms += (delta * usPerQuarterNote) / ppqn / 1000;

    // Update the previous tick and the current tempo for the next iteration
    previousTick = event.tick;
    usPerQuarterNote = event.microsecondsPerQuarterNote;
  }

  // Add the time for the remaining ticks after the last tempo event up to the
  // target tick
  return ms + ((tick - previousTick) * usPerQuarterNote) / ppqn / 1000;
}

/**
 * Converts milliseconds to an absolute MIDI tick.
 *
 * @param ms The time in milliseconds to convert
 * @param ppqn Pulses (ticks) per quarter note
 * @param tempoEvents Tempo events affecting the timing, sorted by tick
 * @returns The corresponding absolute MIDI tick
 */
export function msToTicks(
  ms: number,
  ppqn: number,
  tempoEvents: readonly TempoChange[],
): number {
  let remainingMs = ms;
  let previousTick = 0;
  let usPerQuarterNote = 500000; // 120BPM

  // Iterate through each tempo event to accumulate the time in milliseconds up
  // to the target time in ms
  for (const event of tempoEvents) {
    // Calculate the time in milliseconds for the delta ticks since the previous
    // tempo event
    const delta = event.tick - previousTick;

    // Calculate the duration of this segment in milliseconds based on the
    // current tempo
    const segmentMs = (delta * usPerQuarterNote) / ppqn / 1000;

    // If the segment duration exceeds the remaining time, we have found the
    // correct tick range
    if (segmentMs >= remainingMs) {
      break;
    }

    // Otherwise subtract the segment duration from the remaining time and
    // update the previous tick and tempo
    remainingMs -= segmentMs;
    previousTick = event.tick;
    usPerQuarterNote = event.microsecondsPerQuarterNote;
  }

  // Calculate the final tick based on the remaining time and the current tempo
  const ticks = previousTick + (remainingMs * 1000 * ppqn) / usPerQuarterNote;

  // Ensure the calculated tick is not negative
  return Math.max(0, ticks);
}
