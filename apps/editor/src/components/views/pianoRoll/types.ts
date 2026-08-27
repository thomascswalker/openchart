export interface PianoRollNote {
  tick: number;
  durationTicks: number;
  pitch: number;
  velocity: number;
}

export interface ActiveNote {
  tick: number;
  velocity: number;
}

export interface PianoRollCamera {
  /**
   * Absolute MIDI tick at the left edge of the note viewport.
   */
  startTick: number;

  /**
   * MIDI pitch at the top edge of the viewport.
   *
   * This is a float so vertical panning can be smooth.
   */
  topPitch: number;

  /**
   * Horizontal zoom.
   */
  pixelsPerQuarter: number;

  /**
   * Vertical zoom.
   */
  pixelsPerSemitone: number;
}
