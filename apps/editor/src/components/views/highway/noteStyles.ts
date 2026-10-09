import type { MidiEvent, TimedMidiEvent } from "@midiedit/core";

export interface GuitarNoteLike {
  note: number;
  start: number;
  end: number;
}

export interface GuitarNoteStyle {
  hopo: boolean;
  tap: boolean;
}

export interface TickRange {
  start: number;
  end: number;
}

interface SysExEventLike {
  status: 0xf0 | 0xf7;
  data: Uint8Array;
}

function isSysExEvent(event: MidiEvent): event is MidiEvent & SysExEventLike {
  return event.status === 0xf0 || event.status === 0xf7;
}

function isTapSysEx(event: MidiEvent): boolean {
  if (!isSysExEvent(event)) return false;
  const data = event.data;
  return data.some(
    (byte, index) =>
      byte === 0x04 &&
      data[index - 1] === 0x01 &&
      data[index - 2] === 0x00 &&
      data[index - 3] === 0x50,
  );
}

export function getTapSysExRanges(
  events: readonly TimedMidiEvent[],
): TickRange[] {
  const ranges: TickRange[] = [];
  let phraseStart: number | null = null;
  for (const { event, tick } of events) {
    if (!isTapSysEx(event)) continue;
    if (phraseStart === null) {
      phraseStart = tick;
    } else {
      ranges.push({ start: phraseStart, end: tick });
      phraseStart = null;
    }
  }
  if (phraseStart !== null) ranges.push({ start: phraseStart, end: Infinity });
  return ranges;
}

export function getFiveFretNoteStyles<T extends GuitarNoteLike>(
  notes: readonly T[],
  trackNotes: readonly GuitarNoteLike[],
  options: {
    forceHopoPitch?: number;
    forceStrumPitch?: number;
    tapMarkerPitches?: readonly number[];
    ppqn: number;
    tapSysExRanges?: readonly TickRange[];
  },
): Map<T, GuitarNoteStyle> {
  const notesByTick = new Map<number, T[]>();
  for (const note of notes) {
    const atTick = notesByTick.get(note.start);
    if (atTick) atTick.push(note);
    else notesByTick.set(note.start, [note]);
  }

  const forceHopoTicks = new Set<number>();
  const forceStrumTicks = new Set<number>();
  const tapRanges = [...(options.tapSysExRanges ?? [])];
  for (const note of trackNotes) {
    if (
      options.forceHopoPitch !== undefined &&
      note.note === options.forceHopoPitch
    ) {
      forceHopoTicks.add(note.start);
    }
    if (
      options.forceStrumPitch !== undefined &&
      note.note === options.forceStrumPitch
    ) {
      forceStrumTicks.add(note.start);
    }
    if (options.tapMarkerPitches?.includes(note.note)) {
      tapRanges.push({ start: note.start, end: note.end });
    }
  }

  const orderedGroups = [...notesByTick.entries()].sort(
    ([left], [right]) => left - right,
  );
  const styles = new Map<T, GuitarNoteStyle>();
  const hopoThreshold = Math.floor(options.ppqn / 3) + 1;
  let previous: { tick: number; notes: T[] } | null = null;
  for (const [tick, group] of orderedGroups) {
    const forceHopo = forceHopoTicks.has(tick);
    const forceStrum = forceStrumTicks.has(tick);
    const naturalHopo =
      !forceStrum &&
      group.length === 1 &&
      previous !== null &&
      tick - previous.tick <= hopoThreshold &&
      !previous.notes.some(
        (previousNote) => previousNote.note === group[0].note,
      );
    for (const note of group) {
      styles.set(note, {
        hopo: forceHopo || naturalHopo,
        tap: tapRanges.some(
          (range) => note.start >= range.start && note.start <= range.end,
        ),
      });
    }
    previous = { tick, notes: group };
  }
  return styles;
}
