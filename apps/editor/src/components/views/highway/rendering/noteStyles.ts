import type { MidiEvent } from "@openchart/midi";

export interface GuitarNoteLike {
  pitch: number;
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
  return (
    (event.status === 0xf0 || event.status === 0xf7) &&
    "data" in event &&
    event.data instanceof Uint8Array
  );
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

export function getTapSysExRanges(events: readonly MidiEvent[]): TickRange[] {
  const ranges: TickRange[] = [];
  let phraseStart: number | null = null;
  for (const event of events) {
    if (!isTapSysEx(event)) continue;
    if (phraseStart === null) {
      phraseStart = event.tick;
    } else {
      ranges.push({ start: phraseStart, end: event.tick });
      phraseStart = null;
    }
  }
  if (phraseStart !== null) ranges.push({ start: phraseStart, end: Infinity });
  return ranges;
}

export type AutoHopoExclusion = "sameLaneAsPrevious" | "chord";

/**
 * HOPO / tap styling for lane notes. Everything comes from the track's
 * ruleset: marker pitches (by effect), the HOPO threshold (resolved to ticks,
 * with its own inclusivity) and which cases still default to strum.
 */
export function getFiveFretNoteStyles<T extends GuitarNoteLike>(
  notes: readonly T[],
  trackNotes: readonly GuitarNoteLike[],
  options: {
    forceHopoPitch?: number;
    forceStrumPitch?: number;
    tapMarkerPitches?: readonly number[];
    /** Natural HOPO window in ticks; omitted = no natural HOPOs. */
    hopoThresholdTicks?: number;
    /** `<=` when true (the ruleset default for guitar), `<` otherwise. */
    hopoInclusive?: boolean;
    /** Cases where a note inside the window still defaults to strum. */
    autoHopoExclusions?: readonly AutoHopoExclusion[];
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
      note.pitch === options.forceHopoPitch
    ) {
      forceHopoTicks.add(note.start);
    }
    if (
      options.forceStrumPitch !== undefined &&
      note.pitch === options.forceStrumPitch
    ) {
      forceStrumTicks.add(note.start);
    }
    if (options.tapMarkerPitches?.includes(note.pitch)) {
      tapRanges.push({ start: note.start, end: note.end });
    }
  }

  const exclusions = new Set(options.autoHopoExclusions ?? []);
  const threshold = options.hopoThresholdTicks;
  const inclusive = options.hopoInclusive ?? false;
  const withinThreshold = (gap: number): boolean =>
    threshold !== undefined && (inclusive ? gap <= threshold : gap < threshold);

  const orderedGroups = [...notesByTick.entries()].sort(
    ([left], [right]) => left - right,
  );
  const styles = new Map<T, GuitarNoteStyle>();
  let previous: { tick: number; notes: T[] } | null = null;
  for (const [tick, group] of orderedGroups) {
    const forceHopo = forceHopoTicks.has(tick);
    const forceStrum = forceStrumTicks.has(tick);
    const naturalHopo =
      !forceStrum &&
      previous !== null &&
      withinThreshold(tick - previous.tick) &&
      (!exclusions.has("chord") || group.length === 1) &&
      (!exclusions.has("sameLaneAsPrevious") ||
        !previous.notes.some((previousNote) =>
          group.some((note) => note.pitch === previousNote.pitch),
        ));
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
