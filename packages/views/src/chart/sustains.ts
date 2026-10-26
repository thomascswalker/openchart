export type SustainCutPolicy =
  "all" | "none" | "preferred-only" | "all-but-preferred";

export interface SustainCutOptions<TNoteOn = unknown> {
  cutPolicy: SustainCutPolicy;
  preferredNoteOn?: TNoteOn | null;
}

export interface SustainEndOptions {
  extendPastNext?: boolean;
}

export function getSustainCutOptions<TNoteOn>(
  shiftKey: boolean,
  preferredNoteOn: TNoteOn | null = null,
  sameLanePlacement = false,
): SustainCutOptions<TNoteOn> {
  const cutPolicy =
    preferredNoteOn === null
      ? shiftKey
        ? "none"
        : "all"
      : sameLanePlacement
        ? shiftKey
          ? "preferred-only"
          : "all"
        : shiftKey
          ? "all"
          : "preferred-only";
  return { cutPolicy, preferredNoteOn };
}

export function getHighwaySustainEnd(
  noteStart: number,
  pointerTick: number,
  otherNoteStarts: readonly number[] = [],
  options: SustainEndOptions = {},
): number {
  const requestedEnd = Math.max(noteStart + 1, pointerTick);
  if (options.extendPastNext) return requestedEnd;
  const nextNoteStart = otherNoteStarts
    .filter((tick) => tick > noteStart && tick < requestedEnd)
    .reduce((next, tick) => Math.min(next, tick), Infinity);
  return Number.isFinite(nextNoteStart)
    ? Math.max(noteStart + 1, nextNoteStart)
    : requestedEnd;
}

export function getSustainsAtTick<T extends { start: number; end: number }>(
  notes: readonly T[],
  tick: number,
): T[] {
  return notes.filter((note) => note.start < tick && tick < note.end);
}

export function getSustainCutTargets<
  T extends { start: number; end: number; noteOn: unknown },
>(
  notes: readonly T[],
  tick: number,
  options: SustainCutOptions<T["noteOn"]>,
): T[] {
  const crossing = getSustainsAtTick(notes, tick);
  switch (options.cutPolicy) {
    case "all":
      return crossing;
    case "none":
      return [];
    case "preferred-only":
      return options.preferredNoteOn == null
        ? []
        : crossing.filter((note) => note.noteOn === options.preferredNoteOn);
    case "all-but-preferred":
      return options.preferredNoteOn == null
        ? crossing
        : crossing.filter((note) => note.noteOn !== options.preferredNoteOn);
  }
}
