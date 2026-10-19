/** Pitch classes (0 = C) of the black keys within an octave. */
export const BlackPitchClasses = new Set([
  1, // C#
  3, // D#
  6, // F#
  8, // G#
  10, // A#
]);

/** Lowest pitch representable in a MIDI file. */
export const MinimumMidiPitch = 0;

/** Highest pitch representable in a MIDI file. */
export const MaximumMidiPitch = 127;

/** Velocity written to notes that are created from the piano roll. */
export const DefaultNoteVelocity = 100;

/** Length, in ticks, of a freshly created note before it is dragged out. */
export const NewNoteDurationTicks = 1;

/** Tempo assumed when a document has none: 120 BPM. */
export const DefaultMicrosecondsPerQuarterNote = 500_000;

/**
 * Time signature assumed when a document has none: 4/4. The denominator is
 * stored as a power of two, so 2 means quarter notes.
 */
export const DefaultTimeSignature = { numerator: 4, denominator: 2 } as const;

/** Closest the horizontal zoom may get, in pixels per quarter note. */
export const MinimumPixelsPerQuarter = 20;

/** Furthest the horizontal zoom may get, in pixels per quarter note. */
export const MaximumPixelsPerQuarter = 2000;

/** Closest the vertical zoom may get, in pixels per semitone row. */
export const MinimumPixelsPerSemitone = 6;

/** Furthest the vertical zoom may get, in pixels per semitone row. */
export const MaximumPixelsPerSemitone = 64;

/**
 * Duration, in milliseconds, of one horizontal timeline unit. The camera's
 * horizontal zoom is expressed in pixels per unit, which is one quarter note
 * at 120 BPM.
 */
export const MillisecondsPerTimelineUnit = 500;

/** Narrowest a note is ever drawn, in pixels, so short notes stay visible. */
export const MinimumNoteWidthPixels = 2;

/**
 * Height, in pixels, of the tempo/time-signature strip above the grid.
 */
export const HeaderHeight = 36;

/** Height, in pixels, of one lane of the default three-lane header. */
export const HeaderLaneHeight = HeaderHeight / 3;

/**
 * Distance, in pixels, within which a click is considered "on" a tempo/TS marker.
 */
export const HeaderMarkerHitRadius = 6;

/**
 * Width, in pixels, of a marker's label hit-box, extending rightward from
 * its tick position (matching the drawn label so hover/click land on the
 * visible text, not just the marker's exact tick pixel).
 */
export const HeaderMarkerLabelWidth = 50;

/**
 * Height, in pixels, of a marker's label hit-box.
 */
export const HeaderMarkerLabelHeight = 25;

/**
 * Width, in pixels, of the draggable hit-region along a note's right edge
 * used to resize its duration.
 */
export const NoteResizeHandleWidth = 6;

/**
 * Controls how quickly wheel input zooms.
 */
export const ZoomSensitivity = 0.0015;

/**
 * Selectable snap-to-grid note-value denominators (as in "1/N").
 */
export const SnapDenominators = [
  1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64,
] as const;

/** Width, in pixels, of the piano keyboard gutter on the left of the roll. */
export const KeyboardWidth = 64;
