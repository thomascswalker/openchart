import type { MidiChannelEvent } from "@openchart/core";
import type { PianoRollNote } from "../types";

/** A note being resized, with the duration it had when the gesture began. */

export interface ResizeTarget {
  /** The note being resized. */
  note: PianoRollNote;

  /** Duration, in ticks, at the start of the gesture. */
  initialDuration: number;
}
/** A note being moved, with the position it had when the gesture began. */

export interface MoveTarget {
  /** The note being moved. */
  note: PianoRollNote;

  /** Start tick at the beginning of the gesture. */
  initialTick: number;

  /** Pitch at the beginning of the gesture. */
  initialPitch: number;
}
/** One note held on the piano roll's internal clipboard. */

export interface ClipboardNote {
  /** Start tick relative to the earliest copied note. */
  relativeTick: number;

  /** MIDI pitch. */
  pitch: number;

  /** Length of the note in ticks. */
  durationTicks: number;

  /** MIDI note-on velocity. */
  velocity: number;

  /** Lyric copied with a vocal note; pasted back onto the same tick. */
  lyric?: string;
}
/** Result of a successful create gesture. */

export interface CreatedNote {
  /** Note-on event of the new note. */
  noteOn: MidiChannelEvent;

  /** The note needs a lyric before the create gesture is complete. */
  needsLyric: boolean;
}
/** Where and how a new note is written into a track. */

export interface NoteInsertion {
  /** MIDI pitch. */
  pitch: number;

  /** Absolute start tick. */
  tick: number;

  /** MIDI note-on velocity. */
  velocity: number;

  /** Length of the note in ticks. */
  durationTicks: number;
}

export type EditMode = "default" | "vocal";
