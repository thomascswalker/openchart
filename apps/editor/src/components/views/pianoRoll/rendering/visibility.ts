import { MinimumNoteWidthPixels } from "../constants";
import type { PianoRollNote } from "../types";

/**
 * Prefix maxima over a tick-sorted note list. They let a binary search find
 * the first note that can still reach the viewport despite earlier, longer
 * notes.
 */
export interface PianoRollNoteIndex {
  /** The note list the index was built from; guards against stale indexes. */
  source: PianoRollNote[];

  /** `maxEndTicks[i]` is the latest end tick among notes `0..i`. */
  maxEndTicks: number[];

  /** `maxStartTicks[i]` is the latest start tick among notes `0..i`. */
  maxStartTicks: number[];
}

/** Half-open range of indexes into a note list. */
export interface PianoRollVisibleRange {
  /** Index of the first visible note. */
  start: number;

  /** Index one past the last visible note. */
  end: number;
}

/** Builds the prefix-maxima index for a note list sorted by start tick. */
export function buildNoteIndex(notes: PianoRollNote[]): PianoRollNoteIndex {
  const maxEndTicks: number[] = [];
  const maxStartTicks: number[] = [];
  let maxEnd = Number.NEGATIVE_INFINITY;
  let maxStart = Number.NEGATIVE_INFINITY;

  // Record the running maxima at every position.
  notes.forEach((note, index) => {
    maxEnd = Math.max(maxEnd, note.tick + note.durationTicks);
    maxStart = Math.max(maxStart, note.tick);
    maxEndTicks[index] = maxEnd;
    maxStartTicks[index] = maxStart;
  });

  return { source: notes, maxEndTicks, maxStartTicks };
}

/**
 * Finds the slice of `notes` that may intersect `[startTick, endTick]`.
 * `tickWidth` is pixels per tick, used to account for the minimum drawn width.
 */
export function getVisibleNoteRange(
  notes: PianoRollNote[],
  index: PianoRollNoteIndex | null,
  startTick: number,
  endTick: number,
  tickWidth: number,
): PianoRollVisibleRange {
  if (notes.length === 0 || endTick < startTick) {
    return { start: 0, end: 0 };
  }

  const minimumNoteWidthTicks = MinimumNoteWidthPixels / tickWidth;
  const first = getFirstVisibleNoteIndex(
    notes,
    index,
    startTick,
    minimumNoteWidthTicks,
  );

  // Walk forward until notes start after the visible range.
  let end = first;
  while (end < notes.length && notes[end].tick <= endTick) {
    end++;
  }

  return { start: first, end };
}

/**
 * Binary-searches for the first note that reaches `startTick`. Falls back to
 * 0 (scan everything) when the index is missing or built for another list.
 */
function getFirstVisibleNoteIndex(
  notes: PianoRollNote[],
  index: PianoRollNoteIndex | null,
  startTick: number,
  minimumNoteWidthTicks: number,
): number {
  if (!index || index.source !== notes) return 0;

  let low = 0;
  let high = notes.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    // A note is drawn at least minimumNoteWidthTicks wide, so it may reach
    // further than its real end.
    const maximumEnd = Math.max(
      index.maxEndTicks[middle],
      index.maxStartTicks[middle] + minimumNoteWidthTicks,
    );

    if (maximumEnd < startTick) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}
