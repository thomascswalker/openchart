import type { MidiChannelEvent, MidiTrack } from "@openchart/core";
import type { Vector2 } from "three";
import type { PianoRollNote } from "../types";
import type {
  EditMode,
  CreatedNote,
  MoveTarget,
  ResizeTarget,
  ClipboardNote,
  NoteInsertion,
} from "./types";

/**
 * Model mutations behind the Piano Roll's gestures. The controller owns
 * gesture state, selection and history bracketing; a strategy decides what
 * each gesture does to the MIDI data. The default strategy edits raw pitches;
 * the vocal strategy routes everything through the vocal data model.
 */
export interface IEditContext {
  /** Which profile editing mode this strategy implements. */
  readonly id: EditMode;

  /** The track to edit */
  getTrack(): MidiTrack | null;

  /** Creates a note at a canvas position; null when nothing was created. */
  create(local: Vector2): CreatedNote | null;

  /** Called once when a move gesture starts (e.g. to capture lyrics). */
  beginMove(targets: readonly MoveTarget[]): void;

  /** Moves targets by a delta from their initial position; true if changed. */
  move(
    targets: readonly MoveTarget[],
    tickDelta: number,
    pitchDelta: number,
  ): boolean;

  /** Resizes targets by a delta from their initial duration; true if changed. */
  resize(targets: readonly ResizeTarget[], delta: number): boolean;

  /** Deletes notes; true if anything was removed. */
  remove(notes: readonly PianoRollNote[]): boolean;

  /** Shifts note pitches by `semitones`; true if anything changed. */
  transpose(notes: readonly PianoRollNote[], semitones: number): boolean;

  /** Shifts note start ticks by `deltaTicks`; true if anything changed. */
  shift(notes: readonly PianoRollNote[], deltaTicks: number): boolean;

  /** Captures notes for the clipboard. */
  copy(notes: readonly PianoRollNote[]): ClipboardNote[];

  /** Inserts clipboard notes at `anchorTick`; returns the new note-ons. */
  paste(
    entries: readonly ClipboardNote[],
    anchorTick: number,
  ): MidiChannelEvent[];

  /** Vocal only: sets the lyric of a just-created note. */
  setLyric?(noteOn: MidiChannelEvent, text: string): boolean;
}

/**
 * Applies `apply` to every item and reports whether any call returned true.
 * Every item is processed, even after one has reported a change.
 */
export function applyToEach<T>(
  items: readonly T[],
  apply: (item: T) => boolean,
): boolean {
  let changed = false;

  for (const item of items) {
    changed = apply(item) || changed;
  }

  return changed;
}

/** Writes a note into `track` at its tick, keeping the track ordered. */
export function insertNote(
  track: MidiTrack,
  insertion: NoteInsertion,
): MidiChannelEvent {
  const { pitch, tick, velocity, durationTicks } = insertion;
  const insertAt = track.getInsertionIndexAt(tick);
  const startDelta = tick - track.getAbsoluteTickAt(insertAt);

  return track.addNote(pitch, startDelta, velocity, durationTicks, insertAt)
    .noteOn;
}

/** Captures notes as clipboard entries positioned relative to the first one. */
export function copyNotes(notes: readonly PianoRollNote[]): ClipboardNote[] {
  if (notes.length === 0) return [];

  const minTick = Math.min(...notes.map((note) => note.tick));

  return notes.map((note) => ({
    relativeTick: note.tick - minTick,
    pitch: note.pitch,
    durationTicks: note.durationTicks,
    velocity: note.velocity,
  }));
}
