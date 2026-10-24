import {
  MetaType,
  type MidiNote,
  type MidiTrack,
  type TextMidiEvent,
} from "@openchart/midi";
import type { MidiNotePhrase } from "./chartEditing.js";
import type { InstrumentTrackViewConfig } from "./config.js";

/** Note kinds that live on the VOCALS track. */
export type VocalNoteKind = "pitched" | "pitchless" | "percussion";

/** Phrase kinds that live on the VOCALS track. */
export type VocalPhraseKind = "vocal" | "power-window" | "stagepower";

export type VocalClassification =
  | { type: "note"; kind: VocalNoteKind }
  | { type: "phrase"; kind: VocalPhraseKind }
  | { type: "unknown" };

/** Resolved MIDI pitches for every vocal note and phrase kind. */
export interface VocalLayout {
  /** Inclusive pitched-note range. */
  range: { low: number; high: number };
  vocalPhrase: number;
  powerWindow: number;
  power: number;
  percussion: number;
  pitchlessHigh: number;
  pitchlessLow: number;
  /** Pitch that new pitchless notes are written to. */
  pitchlessPlacement: number;
}

export const DEFAULT_VOCAL_LAYOUT: Readonly<VocalLayout> = Object.freeze({
  range: Object.freeze({ low: 36, high: 84 }),
  vocalPhrase: 96,
  powerWindow: 111,
  power: 116,
  percussion: 90,
  pitchlessHigh: 85,
  pitchlessLow: 35,
  pitchlessPlacement: 85,
});

export const VOCAL_PHRASE_KINDS: readonly VocalPhraseKind[] = [
  "vocal",
  "power-window",
  "stagepower",
];

function pitchOr(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! >= 0 && value! <= 127
    ? value!
    : fallback;
}

export function vocalLayoutFromConfig(
  config: InstrumentTrackViewConfig,
): VocalLayout {
  const notes = config.notes;
  const defaults = DEFAULT_VOCAL_LAYOUT;
  const range = config.vocals?.range ?? defaults.range;
  const layout: VocalLayout = {
    range: {
      low: Math.min(range.low, range.high),
      high: Math.max(range.low, range.high),
    },
    vocalPhrase: pitchOr(notes.vocalPhrase, defaults.vocalPhrase),
    powerWindow: pitchOr(notes.powerWindow, defaults.powerWindow),
    power: pitchOr(notes.power, defaults.power),
    percussion: pitchOr(notes.percussion, defaults.percussion),
    pitchlessHigh: pitchOr(notes.pitchlessHigh, defaults.pitchlessHigh),
    pitchlessLow: pitchOr(notes.pitchlessLow, defaults.pitchlessLow),
    pitchlessPlacement: defaults.pitchlessPlacement,
  };
  layout.pitchlessPlacement =
    config.vocals?.pitchlessPlacement === "pitchlessLow"
      ? layout.pitchlessLow
      : layout.pitchlessHigh;
  return layout;
}

export function classifyVocalPitch(
  layout: VocalLayout,
  pitch: number,
): VocalClassification {
  if (pitch >= layout.range.low && pitch <= layout.range.high) {
    return { type: "note", kind: "pitched" };
  }
  if (pitch === layout.pitchlessHigh || pitch === layout.pitchlessLow) {
    return { type: "note", kind: "pitchless" };
  }
  if (pitch === layout.percussion) return { type: "note", kind: "percussion" };
  if (pitch === layout.vocalPhrase) return { type: "phrase", kind: "vocal" };
  if (pitch === layout.powerWindow) {
    return { type: "phrase", kind: "power-window" };
  }
  if (pitch === layout.power) return { type: "phrase", kind: "stagepower" };
  return { type: "unknown" };
}

/** Pitched and pitchless notes carry a lyric; percussion does not. */
export function vocalKindNeedsLyric(kind: VocalNoteKind): boolean {
  return kind !== "percussion";
}

export function vocalPhrasePitch(
  layout: VocalLayout,
  kind: VocalPhraseKind,
): number {
  switch (kind) {
    case "vocal":
      return layout.vocalPhrase;
    case "power-window":
      return layout.powerWindow;
    case "stagepower":
      return layout.power;
  }
}

export type TimedLyric = TextMidiEvent;

export interface VocalNote {
  note: MidiNote;
  kind: VocalNoteKind;
  /** The Lyric event on the note's tick, if any. Percussion is always null. */
  lyric: TimedLyric | null;
}

export function getLyrics(track: MidiTrack | undefined | null): TimedLyric[] {
  if (!track) return [];
  return track.getTextEvents().filter((event) => event.type === MetaType.Lyric);
}

interface LyricPairing {
  notes: VocalNote[];
  orphans: TimedLyric[];
  unknown: MidiNote[];
}

/**
 * Pairs each pitched/pitchless note with the first unclaimed Lyric on the
 * same tick. Lyrics on a percussion-only tick are tolerated (not orphans) so
 * charts that annotate percussion keep validating.
 */
function pairLyrics(
  track: MidiTrack | undefined | null,
  layout: VocalLayout,
): LyricPairing {
  if (!track) return { notes: [], orphans: [], unknown: [] };
  const byTick = new Map<number, TimedLyric[]>();
  for (const lyric of getLyrics(track)) {
    const list = byTick.get(lyric.tick) ?? [];
    list.push(lyric);
    byTick.set(lyric.tick, list);
  }
  const notes: VocalNote[] = [];
  const unknown: MidiNote[] = [];
  const percussionTicks = new Set<number>();
  for (const note of track.getNotes()) {
    const classification = classifyVocalPitch(layout, note.note);
    if (classification.type === "unknown") {
      unknown.push(note);
      continue;
    }
    if (classification.type !== "note") continue;
    const { kind } = classification;
    if (!vocalKindNeedsLyric(kind)) {
      percussionTicks.add(note.start);
      notes.push({ note, kind, lyric: null });
      continue;
    }
    const lyric = byTick.get(note.start)?.shift() ?? null;
    notes.push({ note, kind, lyric });
  }
  const orphans: TimedLyric[] = [];
  for (const [tick, lyrics] of byTick) {
    if (percussionTicks.has(tick)) continue;
    orphans.push(...lyrics);
  }
  orphans.sort((a, b) => a.tick - b.tick);
  return { notes, orphans, unknown };
}

export function getVocalNotes(
  track: MidiTrack | undefined | null,
  layout: VocalLayout,
  kind?: VocalNoteKind,
): VocalNote[] {
  const { notes } = pairLyrics(track, layout);
  return kind ? notes.filter((note) => note.kind === kind) : notes;
}

export function findVocalNote(
  track: MidiTrack | undefined | null,
  layout: VocalLayout,
  note: MidiNote,
): VocalNote | null {
  return (
    getVocalNotes(track, layout).find(
      (candidate) => candidate.note.noteOn === note.noteOn,
    ) ?? null
  );
}

export function getVocalPhrases(
  track: MidiTrack | undefined | null,
  layout: VocalLayout,
  kind: VocalPhraseKind,
): MidiNotePhrase[] {
  if (!track) return [];
  const pitch = vocalPhrasePitch(layout, kind);
  return track
    .getNotes({ pitch: { low: pitch, high: pitch + 1 } })
    .map((note) => ({ start: note.start, end: note.end, kind, note }));
}

function insertNote(
  track: MidiTrack,
  pitch: number,
  start: number,
  end: number,
  velocity = 100,
): MidiNote | null {
  return track.addNoteAt({
    tick: start,
    pitch,
    velocity,
    duration: Math.max(1, end - start),
  });
}

function validSpan(start: number, end: number): boolean {
  return (
    Number.isInteger(start) &&
    start >= 0 &&
    Number.isInteger(end) &&
    end > start
  );
}

/** Pitch a new note of `kind` is written to, or null when invalid. */
export function vocalNotePitch(
  layout: VocalLayout,
  kind: VocalNoteKind,
  pitch?: number,
): number | null {
  switch (kind) {
    case "pitched":
      return pitch !== undefined &&
        Number.isInteger(pitch) &&
        pitch >= layout.range.low &&
        pitch <= layout.range.high
        ? pitch
        : null;
    case "pitchless":
      return pitch === layout.pitchlessHigh || pitch === layout.pitchlessLow
        ? pitch
        : layout.pitchlessPlacement;
    case "percussion":
      return layout.percussion;
  }
}

export interface AddVocalNoteOptions {
  /** Required for pitched notes; selects 85 or 35 for pitchless notes. */
  pitch?: number;
  /** Lyric written on the note's tick in the same operation. */
  lyric?: string;
  velocity?: number;
}

/**
 * Adds a vocal note and, when `lyric` is non-empty, its Lyric event on the
 * same tick. Lyrics are ignored for percussion. Returns null without
 * changing the track for invalid input.
 */
export function addVocalNote(
  track: MidiTrack,
  layout: VocalLayout,
  kind: VocalNoteKind,
  start: number,
  end: number,
  options: AddVocalNoteOptions = {},
): VocalNote | null {
  const pitch = vocalNotePitch(layout, kind, options.pitch);
  if (pitch === null || !validSpan(start, end)) return null;
  const note = insertNote(track, pitch, start, end, options.velocity);
  if (!note) return null;
  let lyric: TimedLyric | null = null;
  const text = options.lyric;
  if (vocalKindNeedsLyric(kind) && text !== undefined && text.trim()) {
    lyric = track.addTextEvent(MetaType.Lyric, note.start, text);
  }
  return { note, kind, lyric };
}

export interface VocalMove {
  note: MidiNote;
  start: number;
  /** New pitch; only applied to pitched notes, clamped to the range. */
  pitch?: number;
  /**
   * Lyric captured when the gesture began. Pass it for multi-frame drags so
   * notes crossing each other's ticks keep their own lyric. Looked up when
   * omitted.
   */
  lyric?: TextMidiEvent | null;
}

/**
 * Moves notes, keeping each lyric on its note's tick. Pitched notes clamp to
 * the range; non-pitched notes keep their pitch so they can't leave their
 * lane, and pitched notes can't be dragged into special pitches.
 */
export function moveVocalNotes(
  track: MidiTrack,
  layout: VocalLayout,
  moves: readonly VocalMove[],
): boolean {
  const paired = new Map(
    getVocalNotes(track, layout).map((item) => [item.note.noteOn, item]),
  );
  const resolved = moves.map((move) => ({
    ...move,
    lyric:
      move.lyric !== undefined
        ? move.lyric
        : (paired.get(move.note.noteOn)?.lyric ?? null),
  }));
  let changed = false;
  for (const move of resolved) {
    const start = Math.max(0, Math.round(move.start));
    let pitch = move.note.note;
    const classification = classifyVocalPitch(layout, move.note.note);
    if (
      move.pitch !== undefined &&
      classification.type === "note" &&
      classification.kind === "pitched"
    ) {
      pitch = Math.max(
        layout.range.low,
        Math.min(layout.range.high, Math.round(move.pitch)),
      );
    }
    if (move.note.start !== start || pitch !== move.note.note) {
      const duration = move.note.end - move.note.start;
      changed =
        track.updateNote(move.note, {
          start,
          duration,
          pitch,
        }) || changed;
    }
    if (move.lyric) {
      changed = track.moveEvent(move.lyric, start) || changed;
    }
  }
  return changed;
}

/** Removes notes and the lyrics attached to them. */
export function removeVocalNotes(
  track: MidiTrack,
  layout: VocalLayout,
  notes: readonly MidiNote[],
): boolean {
  const paired = new Map(
    getVocalNotes(track, layout).map((item) => [item.note.noteOn, item]),
  );
  const lyrics = notes
    .map((note) => paired.get(note.noteOn)?.lyric)
    .filter(
      (event): event is TextMidiEvent => event !== null && event !== undefined,
    );
  let changed = false;
  for (const note of notes) {
    changed = track.removeNote(note.noteOn, note.noteOff) || changed;
  }
  for (const lyric of lyrics) changed = track.removeEvent(lyric) || changed;
  return changed;
}

/** Sets or replaces a note's lyric. Empty text is rejected. */
export function setVocalLyric(
  track: MidiTrack,
  layout: VocalLayout,
  note: MidiNote,
  text: string,
): boolean {
  if (!text.trim()) return false;
  const vocal = findVocalNote(track, layout, note);
  if (!vocal || !vocalKindNeedsLyric(vocal.kind)) return false;
  if (vocal.lyric) return track.updateTextEvent(vocal.lyric, text);
  track.addTextEvent(MetaType.Lyric, note.start, text);
  return true;
}

/** True when [start, end) intersects another phrase on the same pitch. */
export function vocalPhraseOverlaps(
  track: MidiTrack | undefined | null,
  pitch: number,
  start: number,
  end: number,
  ignore: readonly MidiNote[] = [],
): boolean {
  if (!track) return false;
  const ignored = new Set(ignore.map((note) => note.noteOn));
  return track
    .getNotes({ pitch: { low: pitch, high: pitch + 1 } })
    .some(
      (note) =>
        !ignored.has(note.noteOn) && note.start < end && start < note.end,
    );
}

/** Adds a phrase, rejecting overlap with a phrase of the same kind. */
export function addVocalPhrase(
  track: MidiTrack,
  layout: VocalLayout,
  kind: VocalPhraseKind,
  start: number,
  end: number,
): MidiNotePhrase | null {
  const pitch = vocalPhrasePitch(layout, kind);
  if (!validSpan(start, end) || vocalPhraseOverlaps(track, pitch, start, end)) {
    return null;
  }
  const note = insertNote(track, pitch, start, end);
  return note ? { start: note.start, end: note.end, kind, note } : null;
}

/** Moves/resizes a phrase, rejecting overlap with a phrase of the same kind. */
export function updateVocalPhrase(
  track: MidiTrack,
  note: MidiNote,
  start: number,
  end: number,
  ignore: readonly MidiNote[] = [],
): boolean {
  if (!validSpan(start, end)) return false;
  if (vocalPhraseOverlaps(track, note.note, start, end, [note, ...ignore])) {
    return false;
  }
  if (note.start === start && note.end === end) return true;
  return track.updateNote(note, { start, duration: end - start });
}

export type VocalIssue =
  | { type: "missing-lyric"; tick: number; note: MidiNote }
  | { type: "orphan-lyric"; tick: number; lyric: TextMidiEvent }
  | {
      type: "mismatched-tick";
      tick: number;
      lyric: TextMidiEvent;
      note: MidiNote;
    }
  | { type: "unknown-pitch"; tick: number; note: MidiNote }
  | {
      type: "phrase-overlap";
      tick: number;
      kind: VocalPhraseKind;
      notes: [MidiNote, MidiNote];
    };

export interface VocalValidationOptions {
  /** A lyric within this many ticks of a lyric-less note is a near miss. */
  mismatchTolerance?: number;
}

/**
 * Reports missing lyrics, orphan lyrics, lyrics a few ticks off their note,
 * pitches outside the vocal layout and overlapping phrases of one kind.
 */
export function validateVocalTrack(
  track: MidiTrack | undefined | null,
  layout: VocalLayout,
  options: VocalValidationOptions = {},
): VocalIssue[] {
  if (!track) return [];
  const tolerance = Math.max(0, options.mismatchTolerance ?? 10);
  const { notes, orphans, unknown } = pairLyrics(track, layout);
  const issues: VocalIssue[] = [];
  const missing = notes.filter(
    (item) => vocalKindNeedsLyric(item.kind) && !item.lyric,
  );
  const matchedMissing = new Set<MidiNote>();
  for (const orphan of orphans) {
    const near = missing.find(
      (item) =>
        !matchedMissing.has(item.note) &&
        Math.abs(item.note.start - orphan.tick) <= tolerance,
    );
    if (near) {
      matchedMissing.add(near.note);
      issues.push({
        type: "mismatched-tick",
        tick: orphan.tick,
        lyric: orphan,
        note: near.note,
      });
    } else {
      issues.push({
        type: "orphan-lyric",
        tick: orphan.tick,
        lyric: orphan,
      });
    }
  }
  for (const item of missing) {
    if (matchedMissing.has(item.note)) continue;
    issues.push({
      type: "missing-lyric",
      tick: item.note.start,
      note: item.note,
    });
  }
  for (const note of unknown) {
    issues.push({ type: "unknown-pitch", tick: note.start, note });
  }
  for (const kind of VOCAL_PHRASE_KINDS) {
    const phrases = getVocalPhrases(track, layout, kind);
    for (let index = 1; index < phrases.length; index++) {
      const previous = phrases[index - 1];
      const current = phrases[index];
      if (current.start < previous.end) {
        issues.push({
          type: "phrase-overlap",
          tick: current.start,
          kind,
          notes: [previous.note, current.note],
        });
      }
    }
  }
  return issues.sort((a, b) => a.tick - b.tick);
}

export interface VocalRepairOptions extends VocalValidationOptions {
  /** Also delete lyrics with no note nearby. Off by default (keeps text). */
  removeOrphans?: boolean;
}

/** Snaps near-miss lyrics onto their note's tick. Returns the fix count. */
export function repairVocalTrack(
  track: MidiTrack,
  layout: VocalLayout,
  options: VocalRepairOptions = {},
): number {
  let fixed = 0;
  for (const issue of validateVocalTrack(track, layout, options)) {
    if (issue.type === "mismatched-tick") {
      if (track.moveEvent(issue.lyric, issue.note.start)) fixed++;
    } else if (issue.type === "orphan-lyric" && options.removeOrphans) {
      if (track.removeEvent(issue.lyric)) fixed++;
    }
  }
  return fixed;
}
