import type { PianoRollNote } from "./types";

export interface PianoRollNoteIndex {
  source: PianoRollNote[];
  maxEndTicks: number[];
  maxStartTicks: number[];
}

export interface PianoRollVisibleRange {
  start: number;
  end: number;
}

export function buildNoteIndex(notes: PianoRollNote[]): PianoRollNoteIndex {
  const maxEndTicks: number[] = [];
  const maxStartTicks: number[] = [];
  let maxEnd = Number.NEGATIVE_INFINITY;
  let maxStart = Number.NEGATIVE_INFINITY;

  notes.forEach((note, index) => {
    maxEnd = Math.max(maxEnd, note.tick + note.durationTicks);
    maxStart = Math.max(maxStart, note.tick);
    maxEndTicks[index] = maxEnd;
    maxStartTicks[index] = maxStart;
  });

  return { source: notes, maxEndTicks, maxStartTicks };
}

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

  const first = getFirstVisibleNoteIndex(
    notes,
    index,
    startTick,
    2 / tickWidth,
  );
  let end = first;

  while (end < notes.length && notes[end].tick <= endTick) {
    end++;
  }

  return { start: first, end };
}

function getFirstVisibleNoteIndex(
  notes: PianoRollNote[],
  index: PianoRollNoteIndex | null,
  startTick: number,
  minimumNoteWidthTicks: number,
): number {
  if (!index || index.source !== notes) {
    return 0;
  }

  let low = 0;
  let high = notes.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
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
