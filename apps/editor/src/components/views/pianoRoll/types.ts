import type { MidiNote } from "@midiedit/core";

export interface PianoRollNote {
  tick: number;
  durationTicks: number;
  pitch: number;
  velocity: number;
  /** Back-reference to the source note, used to keep selection stable across edits. */
  midiNote: MidiNote;
}

export interface ActiveNote {
  tick: number;
  velocity: number;
}

export interface PianoRollCamera {
  /**
   * Absolute MIDI tick at the left edge of the note viewport.
   */
  x: number;

  /**
   * MIDI pitch at the top edge of the viewport.
   *
   * This is a float so vertical panning can be smooth.
   */
  y: number;

  /**
   * Horizontal zoom.
   */
  h: number;

  /**
   * Vertical zoom.
   */
  v: number;
}
